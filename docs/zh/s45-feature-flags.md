# s45 — Feature Flags

> **Motto:** Every feature is an experiment until proven stable

`[ Phase 4: 发布管控 ]` · 主题：编译期 DCE、运行时环境变量门控、灰度发布与用户分流

---

## 问题场景

你的 CLI Agent 要上线一个全新的 Coordinator 多 Agent 模式。直接发版全量开放？太危险——新路径没经过大规模验证，一旦出问题只能紧急发 hotfix 回滚代码。你需要：

- **零成本关闭**：功能关掉时，相关代码路径不应该出现在最终产物中（包体更小、攻击面更小）。
- **运维开关**：staging 环境或 CI 中用环境变量强制开关，无需重新构建。
- **渐进放量**：先给 10% 用户试水，观察指标后逐步放量到 50%、100%。
- **用户分流**：内部员工（`internal`）始终启用，外部用户受灰度控制。

一个 `if (config.enableCoordinator)` 解决不了这些——你需要**三层 Feature Flag 架构**。

## 设计决策

| 决策 | 理由 |
|------|------|
| **编译期 DCE** | `feature('X') === false` 时 bundler 将整段代码折叠为死代码并移除，减小包体、消除未启用路径的安全风险 |
| **运行时 env 门控** | `FEATURE_X=true` 环境变量覆盖编译期默认值，供运维和 CI 按需开关，无需重新打包 |
| **灰度 hash** | `hash(flagName + userId) % 100 < percentage` 按用户百分比放量，同一用户每次命中相同桶（确定性） |
| **用户类型分流** | `internal` 用户始终启用——内部人先吃自己的狗粮，外部用户受灰度约束 |
| **中心化注册表** | 所有 flag 注册到 `Map`，便于统一查询、日志输出和运行时管理 |

### 三层 Flag 架构

```
三层决策流程：

  feature('coordinator_mode')
       │
       ▼
  ┌─ 编译期 ──────────────────────────┐
  │  bundler define → false?          │
  │  → DCE 删除整段代码               │
  │  → true? 保留代码，进入运行时     │
  └───────────────────────────────────┘
       │
       ▼
  ┌─ 运行时 env ──────────────────────┐
  │  FEATURE_COORDINATOR_MODE=true?   │
  │  → 强制启用（staging / CI）       │
  │  → 未设置? 继续查灰度服务        │
  └───────────────────────────────────┘
       │
       ▼
  ┌─ 灰度 / 用户分流 ────────────────┐
  │  hash(flag + userId) % 100 < 50? │
  │  → 实验组 (enabled)              │
  │  → 对照组 (disabled)             │
  │  internal 用户? → 始终启用       │
  └───────────────────────────────────┘
```

## 实现要点

### 1. `feature(name)` — 编译期门控

运行时模拟编译期行为：先查注册表，再查环境变量。

```typescript
export function feature(name: string): boolean {
  const flag = flagRegistry.get(name);
  if (flag) return flag.enabled;

  const envKey = `FEATURE_${name.toUpperCase()}`;
  return process.env[envKey] === "true";
}
```

在真正的生产构建中（对照 Claude Code 的 `bun:bundle`），bundler 会在编译期将 `feature('X')` 替换为字面量 `true` 或 `false`。当替换为 `false` 时，`if (feature('X')) { ... }` 整段变成 `if (false) { ... }`，被 tree-shaking 移除——**零运行时成本**。

### 2. `registerFlag` + `loadFlagsFromEnv` — 运行时注册

```typescript
export function registerFlag(name, enabled, source, description): void {
  flagRegistry.set(name, { name, enabled, source, description });
}

export function loadFlagsFromEnv(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("FEATURE_")) {
      const name = key.slice(8).toLowerCase();
      registerFlag(name, value === "true", "env");
    }
  }
}
```

启动时调用 `loadFlagsFromEnv()` 一次性扫描所有 `FEATURE_*` 环境变量，注册到中心 Map。这样运维只需 `FEATURE_VOICE_MODE=true claude-code` 即可强开某功能。

### 3. `isEnabledForUser` — 灰度发布

```typescript
export function isEnabledForUser(flagName, userId, percentage): boolean {
  const hash = simpleHash(flagName + userId);
  return (hash % 100) < percentage;
}
```

关键设计：

- **确定性**：同一 `flagName + userId` 组合每次 hash 相同，用户不会在刷新后跳组。
- **均匀分布**：`simpleHash` 在大样本下近似均匀（教学版用 djb2 变体）。
- **可调节**：`percentage` 从 10 → 50 → 100 逐步放量，每次只需改配置。

### 4. `isEnabledForUserType` — 用户类型分流

```typescript
export function isEnabledForUserType(flagName, userType): boolean {
  const flag = flagRegistry.get(flagName);
  if (!flag) return false;

  if (userType === "internal") return true;  // 内部人始终启用
  return flag.enabled;
}
```

Claude Code 中 `USER_TYPE === 'ant'`（Anthropic 内部员工）走类似逻辑——新功能先在内部跑一段时间，再对外放量。

### 5. `COMMON_FLAGS` — 常用 flag 枚举

```typescript
export const COMMON_FLAGS = {
  REACTIVE_COMPACT: "reactive_compact",
  CONTEXT_COLLAPSE: "context_collapse",
  COORDINATOR_MODE: "coordinator_mode",
  SKILL_SEARCH: "skill_search",
  TOKEN_BUDGET: "token_budget",
  VOICE_MODE: "voice_mode",
  PERFETTO_TRACING: "perfetto_tracing",
} as const;
```

集中声明避免字符串散落——重构 flag 名字时改一处即可，IDE 也能给出自动补全。

## 运行验证

```bash
cd agents/s45-feature-flags
npm run dev

# 1. 默认启动，观察 flag 状态
#    → [feature] coordinator_mode: disabled (no env, no config)
#    → [feature] voice_mode: disabled

# 2. 用环境变量强开某功能
FEATURE_COORDINATOR_MODE=true npm run dev
# → [feature] coordinator_mode: enabled (source: env)
# → 对应代码路径被激活

# 3. 验证灰度分桶（确定性）
#    → 同一 userId 多次启动，命中的实验组不变
#    → 不同 userId 按百分比分布

# 4. 验证用户类型分流
FEATURE_VOICE_MODE=true USER_TYPE=internal npm run dev
# → internal 用户始终启用
# → external 用户受灰度百分比控制
```

## 对照 Claude Code 表格

| 概念 | Claude Code 中的位置 | 说明 |
|------|----------------------|------|
| 编译期 DCE | `bun-shim.ts` — `feature()` | Bun bundler 将 `feature('X')` 替换为编译期常量，未启用分支被 DCE 移除 |
| 运行时 polyfill | `entrypoints/cli.tsx` | 开发模式下 `feature()` 从环境变量 / 配置读取，保持与编译期 API 一致 |
| 远程 flag 服务 | `services/analytics/growthbook.ts` | GrowthBook SDK 提供远程 flag + A/B 测试，支持动态放量与实验分组 |
| 用户类型分流 | `USER_TYPE === 'ant'` 检查 | 内部员工（Anthropic）始终启用实验功能 |
| Flag 数量 | 30+ feature flags | 涵盖 UI、性能、模型、Agent 策略等维度 |

> 教学版用一个 `feature()` 函数串起三层；生产版与打包入口、遥测、A/B 平台深度绑定。

## 深入思考

1. **编译期 DCE 的真正收益**：不仅是包体更小——未启用的代码路径**根本不存在于产物中**，意味着安全审计范围更小，不可能因配置错误意外激活死代码。
2. **灰度 hash 的均匀性**：`simpleHash` 对短字符串足够用，但生产级系统（如 GrowthBook）使用 MurmurHash3 等保证统计均匀。教学版的 djb2 变体在用户量 < 10000 时偏差可接受。
3. **env 覆盖与远程配置的优先级**：当 env 设置了 `FEATURE_X=false` 但远程服务返回 `true` 时，谁赢？Claude Code 的策略是**编译期 > env > remote**——越本地越优先，避免远程服务挂掉后行为不可预测。
4. **Flag 的可观测性**：每次 flag 判定结果应写入遥测事件，否则灰度实验无法分析效果。生产版在 `analytics.track('feature_flag', { name, enabled, source })` 中记录。

## 练习

1. 实现 `feature()` + `registerFlag` + `loadFlagsFromEnv`，写单元测试验证：环境变量 `FEATURE_VOICE_MODE=true` 时 `feature('voice_mode')` 返回 `true`。
2. 实现 `isEnabledForUser`，测试：固定 `userId='user-42'`，`percentage=50` 时结果是否确定性（多次调用一致）；将 `percentage` 从 0 增到 100，验证同一用户的切换点唯一。
3. 为 `COMMON_FLAGS` 的每个 flag 编写一段伪代码，展示在编译期 `false` 时哪些代码路径会被 DCE 移除。
4. 设计一个 `FeatureFlagMiddleware`：在 Agent 主循环中，每轮对话前检查 flag 状态，将当前 flag 快照注入 `ToolContext`，使所有工具都能读取 flag 值。
5. 阅读 Claude Code 的 `growthbook.ts`，比较远程 flag 与本地 `feature()` 的调用时序——远程 SDK 需要异步初始化，如何保证首次调用前已就绪？
