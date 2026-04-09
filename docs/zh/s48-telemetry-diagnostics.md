# s48 — 遥测与诊断

> **Motto:** You can't optimize what you don't measure

`[ Phase 4: 可观测性 ]` · 主题：启动剖析、Doctor、采样遥测与诊断报告

---

## 问题场景

用户说「启动慢」「总报错」，没有数据只能猜。你需要：**启动各阶段耗时**、**一键健康检查（Doctor）**、**合规前提下的产品遥测**，以及**可读的诊断报告**方便支持团队与用户自助。

## 设计决策

| 决策 | 理由 |
|------|------|
| **Checkpoint 剖析** | `performance.mark` 对齐各阶段，便于对比版本回归 |
| **Doctor 聚合检查** | Node 版本、API Key、ripgrep、磁盘、Git 等一次性列出，减少往返 |
| **采样遥测** | internal 全量、external 极低采样，平衡信号与隐私/成本 |
| **结构化报告** | 统一格式化（时间线、表格、通过/失败），便于粘贴到 issue |

### 启动阶段（示例）

| 阶段 | 含义 |
|------|------|
| import | 从入口到主模块 import 完成 |
| init | 同步初始化逻辑 |
| settings | 设置加载（可能触盘多次） |
| total | 到首次可交互或 `main` 完成 |

命名与边界要在团队内固定，否则跨版本不可比。

### 采样率（教学约定）

- **internal**：100%（或接近），用于开发迭代与内测。
- **external**：例如 **0.5%** 随机采样，避免海量终端上报压垮管道。

实际阈值以产品与合规为准，并可通过远程配置调整。

## 实现要点

### 1. `profileCheckpoint(name)`

- 内部判断 `SHOULD_PROFILE`：详细模式（环境变量）或命中采样。
- 使用 `performance.mark`；可选并记录 `memoryUsage()` 仅用于深度剖析。
- 成对 checkpoint 计算 `measure` 得到阶段耗时。

### 2. 阶段聚合上送

定义 `PHASE_DEFINITIONS`：`[startMark, endMark]` → 逻辑名 `import_time`、`init_time`、`settings_time`、`total_time`，单次启动一条事件或多字段。

### 3. Doctor

- 调用 `getDoctorDiagnostic()` 聚合：环境、路径、工具版本、配置错误。
- UI：`Doctor.tsx` 分节展示；可复制为文本报告。

### 4. 诊断报告格式化

- 时间线：每行 `+XXXms checkpoint_name`
- 问题列表：错误码、修复建议链接
- 敏感信息：API Key **脱敏**（只显示前后缀）

## 运行验证

```bash
cd agents/s48-telemetry-diagnostics

# 1. 启用性能剖析启动
PROFILE=1 npm run dev
# → [perf] prefetch_start: 0ms
# → [perf] prefetch_done: 182ms
# → [perf] first_render: 245ms
# → 各阶段耗时一目了然

# 2. 运行诊断命令
npm run dev -- doctor
# → 检测 Node 版本、API Key、Git、rg 等
# → ✓ Node v20.11.0 (>=18 required)
# → ✓ API Key configured (sk-ant-...***...xyz)
# → ✗ ripgrep not found (using fallback)

# 3. 验证敏感信息脱敏
#    → API Key 只显示前后缀：sk-ant-***xyz
#    → 路径中的用户名不暴露

# 4. 验证采样遥测
#    → 遥测事件按采样率发送（非全量）
#    → 离线时静默跳过，不影响使用
```

## 对照 Claude Code 表格

| 概念 | Claude Code 中的位置 | 说明 |
|------|----------------------|------|
| 启动剖析 | `src/utils/startupProfiler.ts` | `profileCheckpoint`、`PHASE_DEFINITIONS`；`STATSIG_SAMPLE_RATE = 0.005`；`USER_TYPE === 'ant'` 全量 |
| 详细模式 | `CLAUDE_CODE_PROFILE_STARTUP` | 内存快照、完整报告 |
| Doctor UI | `src/screens/Doctor.tsx` | 展示 dist-tags、诊断、沙箱等 |
| 诊断数据 | `src/utils/doctorDiagnostic.ts` — `getDoctorDiagnostic` | 聚合 `DiagnosticInfo` |
| 遥测上送 | `logEvent` + Statsig | 采样逻辑与 metadata 类型约束 |

## 深入思考

1. **为何采样在模块加载时决定？** 避免每个函数里随机判断带来的开销与偏差；未采样用户应接近零成本。
2. **checkpoint 重复**：同一 mark 名可能多次触发（如 settings 重载），内存快照数组需与 mark 顺序对齐，不能简单用 Map 覆盖。
3. **Doctor 与隐私**：报告导出前过滤路径中的用户名、token。
4. **优化循环**：先 Statsig 看 P95 阶段 → 针对性 profiling → 再验证，避免凭感觉改 import。

## 练习

1. 实现 `profileCheckpoint` + `printStartupReport`，仅在 `PROFILE=1` 时打印 `import_time` / `total_time`。
2. 用数学证明：0.5% 采样下，约需多少日活才能以 95% 置信度发现占 1% 会话的启动回归（简化为二项近似，写出思路即可）。
3. 为 Doctor 写 `DiagnosticInfo` 类型：包含 `checks: Array<{ id: string; ok: boolean; detail?: string }>`。
4. 阅读 `startupProfiler.ts` 中 `PHASE_DEFINITIONS`，说明 `total_time` 的起止 mark 为何选 `cli_entry` → `main_after_run`。
5. 设计一个「用户可复制」的诊断模板（Markdown），包含版本、OS、Node、失败项与脱敏后的配置来源。
