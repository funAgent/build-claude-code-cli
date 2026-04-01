# s47 — Native 能力

> **Motto:** The terminal is your canvas; the OS is your palette

`[ Phase 4: 系统能力 ]` · 主题：纯 TS / WASM / 子进程 / Native Addon 与降级链

---

## 问题场景

终端 Agent 既要**跨平台**，又要**快**：全量 JS 扫仓库可能太慢；图像处理、diff 高亮、搜索等场景需要调用 OS 或原生库。另一方面，企业环境可能没有预装工具，或安全策略禁止任意二进制。你需要**策略矩阵 + 明确降级**。

## 设计决策

### 四种策略对比

| 策略 | 优点 | 缺点 | 典型用途 |
|------|------|------|----------|
| **Pure TS** | 无原生依赖、易测试 | CPU 重时慢 | `color-diff`、轻量解析 |
| **WASM** | 可移植、接近原生性能 | 体积、初始化成本 | 加密、解析器、图像解码（视场景） |
| **Spawn 系统命令** | 利用用户已装工具（如 `rg`） | PATH/版本差异、Windows 路径 | `ripgrep`、`git` |
| **Native Addon + FFI** | 极致性能、系统 API | 编译矩阵、升级痛苦 | `sharp`、macOS Carbon/原生剪贴板 |

**选择原则**：默认 Pure TS；瓶颈再 WASM；再不行 spawn；最后才引入 addon（维护成本高）。

### 三档降级（以 ripgrep 为例）

1. **system**：用户强制使用 PATH 上的 `rg`（需注意 PATH 劫持，应用**命令名**解析而非当前目录可执行文件）。
2. **vendor / builtin**：随包携带各平台 `rg` 二进制（`arch-platform` 目录布局）。
3. **embedded / fallback**：在 bundled 模式下用 **同一可执行文件** 以不同 `argv0` 嵌入调用（如 Bun internal），否则可退到纯 TS grep（慢但可用）。

### 剪贴板

- **macOS**：`pbcopy` / `pbpaste`
- **Linux**：`xclip` 或 `wl-copy`/`wl-paste`（Wayland）
- 统一封装 `readClipboard` / `writeClipboard`，失败时返回明确错误码

### `detectCapabilities`

启动或首次使用时检测：

- 可选命令是否存在（`which` / `where`）
- 磁盘可写、Git 是否可用
- 是否沙箱 / CI（影响 spawn 权限）

结果缓存，避免每条消息都探测。

## 实现要点

1. **`ripgrepCommand()`**：返回 `command`、`args`、`argv0`，供 `spawn` 统一使用。
2. **memoize**：配置级检测只做一次；环境变量变化需使缓存失效或进程级固定。
3. **安全**：`findExecutable` 后对 **用户显式要求 system rg** 仍只用 `rg` 名字执行，避免 cwd 下的恶意同名文件（见实现内注释）。
4. **EAGAIN 等**：Docker/CI 线程不足时 stderr 可能提示资源暂不可用，应重试或限并发。

## 对照 Claude Code 表格

| 概念 | Claude Code 中的位置 | 说明 |
|------|----------------------|------|
| Ripgrep 三档 | `src/utils/ripgrep.ts` — `getRipgrepConfig` | `system`（`USE_BUILTIN_RIPGREP` falsy 时找系统 rg）→ `embedded`（bundled）→ `builtin`（`vendor/ripgrep`） |
| 多包 monorepo | `packages/` 下多个包 | 能力按包拆分，主 CLI 聚合 |
| 平台抽象 | `getPlatform`、`execFile` 封装 | Windows / Unix 路径与可执行扩展名 |
| 能力与健康检查 | Doctor + `doctorDiagnostic` | 与「遥测与诊断」章节联动 |

## 深入思考

1. **为何 embedded 用 `process.execPath` + `argv0: 'rg'`？** 单文件/自包含运行时把 rg 编译进宿主，避免再带一份独立二进制路径。
2. **WASM vs spawn**：搜索类任务往往已有成熟 `rg`，spawn 比自研 WASM 维护成本更低；WASM 更适合算法固定、无系统工具的场景。
3. **Native addon 与 CI**：`sharp` 等需预编译二进制，Alpine musl 与 glibc 不兼容——要在文档中标明。
4. **降级要可观测**：记录当前档位（system/builtin/embedded），否则用户报「慢」时无法复现。

## 练习

1. 画出 `getRipgrepConfig` 决策树：环境变量 → bundled → vendor。
2. 实现一个最小 `detectCapabilities()`：返回 `hasGit`、`hasRg`、`clipboard` 可用性。
3. 在 Linux 上封装 `xclip -selection clipboard`，失败时尝试 `wl-copy`，并写单元测试 mock `execFile`。
4. 讨论：为何 Pure TS 实现 diff 颜色仍可能有价值（不 spawn `diff`）？
5. 列举两个应使用 **Native FFI** 而非 spawn 的场景，并说明风险。
