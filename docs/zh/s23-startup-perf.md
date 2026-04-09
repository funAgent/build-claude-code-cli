# s23 — 启动性能优化：从 3 秒到 300 毫秒

> **Fast is a feature**

`[ Phase 5: 流式与性能 ]` · 工具数: 9 · 代码量: ~400 行

---

## 前置知识

- 需要完成: s22 [工具并行执行]

## 你将学到

- 快速路径（fast path）：`--version` 不加载 AI 模块
- 动态 `import()` 懒加载重量级依赖
- 并行预加载（prefetch）I/O 操作
- 性能分析与优化方法论

用户执行 `mycli --version`，期望立即看到版本号。但我们的 CLI 需要：

```
启动加载链（全部串行）:

  ┌─ 1. 加载 TypeScript 运行时 ───┐
  │        (100ms)          │
  └──────────┬──────────────┘
             ↓
  ┌─ 2. 导入 React + Ink ────────┐
  │        (800ms)          │
  └──────────┬──────────────┘
             ↓
  ┌─ 3. 创建 Anthropic Client ───┐
  │        (200ms)          │
  └──────────┬──────────────┘
             ↓
  ┌─ 4. 加载工具注册表 ─────────┐
  │        (300ms)          │
  └──────────┬──────────────┘
             ↓
  ┌─ 5. 读取 RULES.md ──────┐
  │        (150ms)          │
  └──────────┬──────────────┘
             ↓
  ┌─ 6. 检测项目根目录 ─────┐
  │        (100ms)          │
  └─────────────────────────┘

  总计: ~1650ms (用户盯着空白屏幕)
```

所有这些都在 `import` 阶段串行发生。结果？一个 `--version` 需要 2-3 秒。

**CLI 启动速度是用户留存的第一个门槛。** 每慢 100ms，用户就多一分烦躁。

## 设计决策

### 快速路径 (Fast Path)

`--version` 和 `--help` 不需要任何业务模块。在 import 任何东西之前就处理它们：

```typescript
// cli.tsx — 最顶部
const args = process.argv.slice(2);

if (args.includes("--version")) {
  console.log("mycli 0.23.0");
  process.exit(0);  // 不到 10ms 退出
}
```

### 懒加载 (Lazy Loading)

重量级模块用动态 `import()` 延迟到真正需要时：

```typescript
// 不是顶层 import
// import React from "react";
// import { render } from "ink";

// 而是在需要时动态加载
const [React, { render }, { ReplScreen }] = await Promise.all([
  import("react"),
  import("ink"),
  import("./components/repl-screen.js"),
]);
```

`Promise.all` 让三个模块的加载并行，而不是串行。

### 并行预取 (Parallel Prefetch)

启动时有多个独立的 I/O 操作，它们之间没有依赖关系：

```
串行执行（4 个 I/O 排队）:

  detectProjectRoot    loadRules      validateApiKey      detectGit
       200ms             100ms            50ms              100ms
  ├─────────────┼─────────────┼─────────────┼─────────────┤
  0ms          200ms         300ms         350ms          450ms

  总计: 450ms

并行执行（Promise.all）:

  detectProjectRoot (200ms)
       ════════════════════════════════════════
  loadRules (100ms)
       ════════════════
  validateApiKey (50ms)
       ═════════
  detectGit (100ms)
       ════════════════
  ├──────────────────────────────────────────────────────────┤
  0ms                                                      200ms

  总计: max(200, 100, 50, 100) = 200ms  (节省 56%)
```

```typescript
export function startPrefetch(cwd: string) {
  return Promise.all([
    detectProjectRoot(cwd),
    loadRulesFile(cwd),
    validateApiKey(),
    detectGit(cwd),
  ]);
}
```

关键：在动态 import 主程序**之前**就启动 prefetch，让 I/O 和模块加载并行：

```
优化后的启动时间线（I/O 与 CPU 并行）:

  0ms      50ms     100ms    150ms    200ms    250ms    300ms
   ├────────┼────────┼────────┼────────┼────────┼────────┤
   │                                                     │
   │ ═══════════════════════════════════════              │  prefetch (I/O)
   │          200ms                                      │
   │     ════════════════════════════════════════════════ │  dynamic import
   │          (React, Ink, ReplScreen)  300ms             │
   │                                                     │
   └─────────────────────────────────────────────────────┘
                                                     ↓
                                              300ms 时两者都完成
                                                     ↓
                                                  render()
                                                     ↓
                                                  界面显示

对比: 串行启动 500ms → 并行启动 300ms (节省 40%)
```

### 性能打点 (Profile Checkpoint)

```typescript
const startTime = performance.now();

export function profileCheckpoint(label: string) {
  checkpoints.push({ label, elapsed: performance.now() - startTime });
}
```

设置 `CLI_PROFILE=1` 查看启动报告：

```
⏱  Startup Profile:
────────────────────────────────────────
  cli_entry                    0.1ms  (+0.1ms)
  fast_path_done               0.3ms  (+0.2ms)
  prefetch_fired               1.2ms  (+0.9ms)
  main_start                   1.5ms  (+0.3ms)
  imports_done               145.0ms  (+143.5ms)
  prefetch_resolved          146.2ms  (+1.2ms)
  first_render               152.0ms  (+5.8ms)
────────────────────────────────────────
  Total: 152.0ms
```

## 实现

### CLI 入口：分层启动

```typescript
// 1. 打点
profileCheckpoint("cli_entry");

// 2. 快速路径
if (args.includes("--version")) { ... process.exit(0); }

// 3. 启动 prefetch
const prefetch = startPrefetch(process.cwd());

// 4. 动态加载主程序
async function main() {
  const [React, { render }, { ReplScreen }] = await Promise.all([...]);
  await prefetch;
  render(React.createElement(ReplScreen));
}

main();
```

### Prefetch 模块

```typescript
let prefetchPromise: Promise<PrefetchResults> | null = null;

export function startPrefetch(cwd: string) {
  if (prefetchPromise) return prefetchPromise; // 幂等
  prefetchPromise = Promise.all([
    detectProjectRoot(cwd),
    loadRulesFile(cwd),
    validateApiKey(),
    detectGit(cwd),
  ]);
  return prefetchPromise;
}
```

### 延迟预取 (Deferred Prefetch)

有些操作可以在首次渲染**之后**再做（不影响用户看到界面）：

```
首次渲染前（必须）:
  - detectProjectRoot
  - loadRules
  - validateApiKey

首次渲染后（延迟）:
  - 检查更新
  - 加载用户偏好
  - 预热 API 连接
```

## 运行验证

```bash
cd agents/s23-startup-perf

# 快速路径测试
npm run dev -- --version  # 应该立即输出版本号

# 性能分析
npm run dev -- --profile  # 启动后查看 stderr 的性能报告
```

## 对照 Claude Code

| 维度 | 教学版 (s23) | Claude Code |
|------|-------------|-------------|
| 快速路径 | `--version` / `--help` | `--version` + 10+ 子命令各自 lazy import |
| 模块加载 | 3 个动态 import | 几十个按需 import，分子命令路由 |
| 预取数量 | 4 个 | ~15 个（keychain、MCP URLs、AWS/GCP credentials、配额...） |
| 延迟预取 | 未实现 | `startDeferredPrefetches()` 在首次渲染后触发 |
| 安全门控 | 无 | 部分预取需等用户接受 trust 后才执行 |
| 性能度量 | `performance.now()` 打点 | `profileCheckpoint` + telemetry 上报 |
| 缓存 | 无 | `resolveFastModeStatusFromCache` — 先用缓存，后台刷新 |

**Claude Code 的分层启动**：

```
cli.tsx (bootstrap)
  ├── --version → 直接退出
  ├── --dump-system-prompt → 仅 import prompt 模块
  ├── daemon-worker → 仅 import daemon 模块
  └── 完整 REPL → import main.tsx
        ├── startMdmRawRead() — 并行子进程
        ├── startKeychainPrefetch() — 并行 keychain
        ├── ... 模块初始化 ...
        └── startDeferredPrefetches() — 渲染后延迟
```

每个子命令只加载自己需要的模块。`main.tsx` 是最重的路径，但也不是所有代码都在顶层 `import`。

## 深入思考

1. **动态 import 的代价**：每个 `import()` 有一个微小的开销（创建 Promise、解析模块）。对于频繁调用的热路径不合适。启动时的一次性加载是最佳场景。
2. **prefetch 的幂等性**：`startPrefetch` 用模块级变量缓存 Promise。多次调用不会重复执行。这是一个常见的"懒初始化"模式。
3. **测量驱动优化**：没有 profileCheckpoint，你不知道时间花在哪里。先测量，再优化——否则可能在不重要的地方白费力气。

## 练习

1. 在你的机器上实际测量：`time npm run dev -- --version`，然后对比 `time npm run dev`（完整启动）
2. 实现 `startDeferredPrefetches()`：在首次渲染 200ms 后执行一些低优先级初始化
3. 添加一个缓存层：把 `detectProjectRoot` 的结果缓存到 `/tmp`，下次启动直接读取

<details><summary>练习 1 参考实现</summary>

```typescript
/**
 * 在 agents/s23-startup-perf 目录下用系统 time 对比（数字随机器变化，关注数量级）：
 *
 *   time npm run dev -- --version   // 应接近「仅快速路径」耗时，通常远小于完整启动
 *   time npm run dev                 // 含动态 import、prefetch、首屏渲染
 *
 * 把两次的 real/user/sys 记下来；若 --version 仍慢，检查是否在最顶层 import 了重模块。
 */
```

要点：`--version` 应走 `cli.tsx` 里 `process.exit(0)` 分支；完整启动会拉 React/Ink 与 prefetch。对比能验证「快速路径」是否真正避开了重依赖。

</details>

<details><summary>练习 2 参考实现</summary>

```typescript
/** 首次渲染后再做的低优先级工作（检查更新、偏好、预热连接等） */
export function startDeferredPrefetches(): void {
  setTimeout(() => {
    void checkForUpdates();
    void loadUserPreferences();
    void warmupOptionalConnections();
  }, 200);
}

// cli.tsx：render(React.createElement(ReplScreen)) 之后调用
// startDeferredPrefetches();
```

要点：用 `setTimeout` 把非关键路径让出给首帧；函数内用 `void` 显式忽略 Promise，避免未处理 rejection；需要可在组件内用 `useEffect` 触发同一逻辑。

</details>

<details><summary>练习 3 参考实现</summary>

```typescript
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_ROOT = "/tmp/mycli-startup-cache";

function cacheFileForCwd(cwd: string): string {
  const id = createHash("sha256").update(cwd).digest("hex").slice(0, 24);
  return join(CACHE_ROOT, `project-root-${id}.json`);
}

export async function detectProjectRootWithTmpCache(
  cwd: string,
  detectProjectRoot: (cwd: string) => Promise<string | null>,
): Promise<string | null> {
  const file = cacheFileForCwd(cwd);
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
        cwd: string;
        root: string | null;
      };
      if (parsed.cwd === cwd) return parsed.root;
    }
  } catch {
    // 缓存损坏则重新检测
  }
  const root = await detectProjectRoot(cwd);
  mkdirSync(CACHE_ROOT, { recursive: true });
  writeFileSync(file, JSON.stringify({ cwd, root }), "utf-8");
  return root;
}
```

要点：`cwd` 作键的一部分写入 JSON，防止换目录后误读；哈希避免路径字符问题；缓存失败时回退实时检测。生产环境还可加 mtime/TTL 或文件系统变更失效。

</details>

## Phase 5 总结

恭喜！完成 s20-s23，你的 Agent 已经有了**流式输出和生产级性能**：

- ✅ 基础 Streaming（s20）
- ✅ Streaming 进阶（s21）
- ✅ 工具并行执行（s22）
- ✅ 启动性能优化（s23）

下一个 Phase 将解决 Agent 最重要的工程挑战——**上下文管理**。当对话越来越长，怎么避免 token 爆炸？**s24 上下文压缩** 开始。

## 下一课预告

Agent 对话 20 轮后，messages 数组可能达到 50000+ tokens。下一课 **s24 上下文压缩** 将实现对话历史的自动压缩，让 Agent 能在有限上下文窗口内持续工作。
