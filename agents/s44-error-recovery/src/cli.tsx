/**
 * s23 — CLI 入口（启动性能优化版）
 *
 * 关键设计（对照 Claude Code 的 cli.tsx）：
 * 1. 快速路径：--version / --help 不加载重量级模块
 * 2. profileCheckpoint 打点度量启动各阶段耗时
 * 3. 并行 prefetch：在动态 import 之前就启动 I/O
 * 4. 懒加载：重量级模块（ink、react、agent）延迟到需要时加载
 *
 * 启动流程：
 *   cli_entry → fast_path check → start prefetch
 *   → dynamic import main app → render
 *   → deferred prefetches (post first render)
 */

import { profileCheckpoint, printProfile } from "./perf.js";
profileCheckpoint("cli_entry");

const args = process.argv.slice(2);

// ━━━ 快速路径 ━━━
// --version 和 --help 不需要加载任何重量级模块
// 直接 process.exit(0) → 零延迟响应
if (args.includes("--version") || args.includes("-v")) {
  console.log("mycli 0.23.0");
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
mycli — AI Agent CLI

Usage:
  mycli              启动交互式 REPL
  mycli --version    显示版本
  mycli --help       显示帮助
  mycli --profile    启动并打印性能报告
`);
  process.exit(0);
}

if (args.includes("--profile")) {
  process.env.CLI_PROFILE = "1";
}

profileCheckpoint("fast_path_done");

// ━━━ 预取 I/O ━━━
// 在 import 重量级模块之前就启动 I/O 操作
// 利用 I/O 等待时间来并行加载 JS 模块
import { startPrefetch } from "./prefetch.js";
const prefetch = startPrefetch(process.cwd());

profileCheckpoint("prefetch_fired");

async function main() {
  profileCheckpoint("main_start");

  // ━━━ 懒加载 ━━━
  // 用 Promise.all + dynamic import 并行加载三个重量级模块
  // 串行 import 需要等每个模块的解析+编译完成才能开始下一个
  // 并行 import 让 V8 同时解析三个模块，总时间 ≈ max(三者)
  const [React, { render }, { ReplScreen }] = await Promise.all([
    import("react"),
    import("ink"),
    import("./components/repl-screen.js"),
  ]);

  profileCheckpoint("imports_done");

  // prefetch 和 import 是并行的——这里只是确保 prefetch 完成
  // 通常 prefetch I/O 比模块加载快，所以这里几乎不等待
  await prefetch;
  profileCheckpoint("prefetch_resolved");

  render(React.createElement(ReplScreen));
  profileCheckpoint("first_render");

  printProfile();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
