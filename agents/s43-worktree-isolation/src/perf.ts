/**
 * s23 — 启动性能分析工具
 *
 * profileCheckpoint 在关键启动节点打点，用于度量各阶段耗时。
 * 开发时设置 CLI_PROFILE=1 环境变量即可看到启动耗时报告。
 *
 * 对照 Claude Code: utils/startupProfiler.ts
 * 生产版有更细粒度的 checkpoint、自动上报到 telemetry、
 * 和 CLAUDE_CODE_PROFILE 环境变量控制
 * 教学版用最简单的 performance.now() 打点
 */

const startTime = performance.now();
const checkpoints: Array<{ label: string; elapsed: number }> = [];

export function profileCheckpoint(label: string): void {
  const elapsed = performance.now() - startTime;
  checkpoints.push({ label, elapsed });
}

export function printProfile(): void {
  if (!process.env.CLI_PROFILE) return;
  console.error("\n⏱  Startup Profile:");
  console.error("─".repeat(40));
  let prev = 0;
  for (const cp of checkpoints) {
    const delta = cp.elapsed - prev;
    console.error(`  ${cp.label.padEnd(24)} ${cp.elapsed.toFixed(1).padStart(8)}ms  (+${delta.toFixed(1)}ms)`);
    prev = cp.elapsed;
  }
  console.error("─".repeat(40));
  console.error(`  Total: ${checkpoints[checkpoints.length - 1]?.elapsed.toFixed(1)}ms\n`);
}
