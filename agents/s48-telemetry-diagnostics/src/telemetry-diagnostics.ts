/**
 * s48 — 遥测与诊断
 *
 * 你不能优化你没有测量的东西。
 * 遥测让你了解真实用户的体验，诊断让用户自助排查问题。
 *
 * 关键流程：
 * 1. 启动性能分析 — 测量每个启动阶段的耗时
 * 2. Doctor 健康检查 — 自动检测常见问题
 * 3. 采样遥测 — 按百分比采集性能数据
 *
 * 对照 Claude Code:
 * - utils/startupProfiler.ts (~100 行): 启动性能
 * - screens/Doctor.tsx (~500 行): 健康检查 UI
 * - utils/doctorDiagnostic.ts (~300 行): 诊断逻辑
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// ── 启动性能分析 ─────────────────────────────────────────────

/**
 * 性能检查点。
 * 对照 Claude Code: startupProfiler 的 performance.mark
 */
interface PerfCheckpoint {
  name: string;
  timestamp: number;
  memoryMB?: number;
}

const checkpoints: PerfCheckpoint[] = [];
const startTime = Date.now();

/**
 * 记录性能检查点。
 *
 * 对照 Claude Code: profileCheckpoint(name)
 */
export function profileCheckpoint(name: string): void {
  const memoryUsage = process.memoryUsage();
  checkpoints.push({
    name,
    timestamp: Date.now() - startTime,
    memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
  });
}

/**
 * 生成启动性能报告。
 *
 * 对照 Claude Code: startupProfiler 的报告生成
 * 阶段：import_time, init_time, settings_time, total_time
 */
export function getPerformanceReport(): {
  checkpoints: PerfCheckpoint[];
  phases: Record<string, number>;
  totalMs: number;
} {
  const phases: Record<string, number> = {};
  for (let i = 1; i < checkpoints.length; i++) {
    const phaseName = `${checkpoints[i - 1].name} → ${checkpoints[i].name}`;
    phases[phaseName] = checkpoints[i].timestamp - checkpoints[i - 1].timestamp;
  }

  return {
    checkpoints,
    phases,
    totalMs: Date.now() - startTime,
  };
}

/**
 * 保存性能报告到文件。
 *
 * 对照 Claude Code: ~/.claude/startup-perf/<sessionId>.txt
 */
export function savePerformanceReport(sessionId: string): void {
  const dir = join(homedir(), ".agent-cli", "startup-perf");
  mkdirSync(dir, { recursive: true });

  const report = getPerformanceReport();
  const content = [
    `Session: ${sessionId}`,
    `Total: ${report.totalMs}ms`,
    "",
    "Phases:",
    ...Object.entries(report.phases).map(([name, ms]) => `  ${name}: ${ms}ms`),
    "",
    "Checkpoints:",
    ...report.checkpoints.map(
      (cp) => `  [${cp.timestamp}ms] ${cp.name} (${cp.memoryMB}MB)`,
    ),
  ].join("\n");

  writeFileSync(join(dir, `${sessionId}.txt`), content, "utf-8");
}

// ── Doctor 健康检查 ──────────────────────────────────────────

export type DiagnosticStatus = "ok" | "warning" | "error";

export interface DiagnosticItem {
  name: string;
  status: DiagnosticStatus;
  message: string;
  details?: string;
}

export interface DiagnosticReport {
  items: DiagnosticItem[];
  installType: string;
  version: string;
}

/**
 * 执行健康检查。
 *
 * 对照 Claude Code: getDoctorDiagnostic()
 * 检查项目：
 * - 安装类型和版本
 * - ripgrep 可用性
 * - API 密钥配置
 * - 磁盘空间
 * - Node.js 版本
 */
export function runDiagnostics(): DiagnosticReport {
  const items: DiagnosticItem[] = [];

  items.push(checkNodeVersion());
  items.push(checkApiKey());
  items.push(checkRipgrep());
  items.push(checkDiskSpace());
  items.push(checkGitAvailable());

  return {
    items,
    installType: detectInstallType(),
    version: getVersion(),
  };
}

function checkNodeVersion(): DiagnosticItem {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 18) {
    return { name: "Node.js", status: "ok", message: `${version}` };
  }
  return {
    name: "Node.js",
    status: "error",
    message: `${version} (需要 >= 18)`,
  };
}

function checkApiKey(): DiagnosticItem {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: "API Key",
      status: "ok",
      message: "ANTHROPIC_API_KEY 已设置",
    };
  }
  return {
    name: "API Key",
    status: "warning",
    message: "ANTHROPIC_API_KEY 未设置",
    details: "运行前请设置 export ANTHROPIC_API_KEY=sk-...",
  };
}

function checkRipgrep(): DiagnosticItem {
  try {
    const version = execSync("rg --version", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim().split("\n")[0];
    return { name: "ripgrep", status: "ok", message: `system (${version})` };
  } catch {
    return {
      name: "ripgrep",
      status: "warning",
      message: "未安装 (将使用内置搜索)",
      details: "安装 ripgrep 可以加速文件搜索: brew install ripgrep",
    };
  }
}

function checkDiskSpace(): DiagnosticItem {
  try {
    const output = execSync("df -h .", { encoding: "utf-8", stdio: "pipe" });
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const available = parts[3];
      return { name: "磁盘空间", status: "ok", message: `可用 ${available}` };
    }
    return { name: "磁盘空间", status: "ok", message: "检查通过" };
  } catch {
    return { name: "磁盘空间", status: "ok", message: "无法检测" };
  }
}

function checkGitAvailable(): DiagnosticItem {
  try {
    const version = execSync("git --version", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return { name: "Git", status: "ok", message: version };
  } catch {
    return {
      name: "Git",
      status: "error",
      message: "Git 未安装",
      details: "部分功能（worktree、版本控制）需要 Git",
    };
  }
}

function detectInstallType(): string {
  if (process.env.npm_package_name) return "npm-global";
  if (existsSync(join(__dirname, "../../package.json"))) return "development";
  return "standalone";
}

function getVersion(): string {
  return process.env.npm_package_version ?? "0.0.0-dev";
}

// ── 采样遥测 ─────────────────────────────────────────────────

/**
 * 判断是否应采集遥测数据。
 *
 * 对照 Claude Code: startupProfiler 的采样逻辑
 * - 内部用户: 100%
 * - 外部用户: 0.5%
 * - CLAUDE_CODE_PROFILE_STARTUP: 100%
 */
export function shouldCollectTelemetry(options: {
  isInternal?: boolean;
  forceProfile?: boolean;
  sampleRate?: number;
}): boolean {
  if (options.forceProfile || process.env.CLAUDE_CODE_PROFILE_STARTUP === "true") {
    return true;
  }
  if (options.isInternal) return true;

  const rate = options.sampleRate ?? 0.005;
  return Math.random() < rate;
}

/**
 * 格式化诊断报告。
 */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [
    `Agent CLI Doctor`,
    `版本: ${report.version} (${report.installType})`,
    "",
  ];

  for (const item of report.items) {
    const icon = item.status === "ok" ? "✓" : item.status === "warning" ? "⚠" : "✗";
    lines.push(`  ${icon} ${item.name}: ${item.message}`);
    if (item.details) {
      lines.push(`    ${item.details}`);
    }
  }

  return lines.join("\n");
}
