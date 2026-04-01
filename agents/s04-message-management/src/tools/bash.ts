/**
 * s03 — BashTool：复用 s02 的安全 shell 执行
 *
 * 对照 Claude Code: tools/BashTool/BashTool.tsx
 * 生产版增加了：AI 分类器、权限系统、工作目录隔离
 */

import { spawn } from "node:child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*)?.*\s+\/(?!\w)/,
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  />\s*\/dev\/sd/,
  /\bshutdown\b/,
  /\breboot\b/,
  /:(){ :\|:& };:/,
];

export function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `命令匹配危险模式: ${pattern.source}`;
    }
  }
  return null;
}

export async function execShell(
  command: string,
  options: { timeout?: number; maxOutput?: number; cwd?: string } = {}
): Promise<ShellResult> {
  const { timeout = 30_000, maxOutput = 1024 * 1024, cwd } = options;

  const danger = isDangerous(command);
  if (danger) {
    return { stdout: "", stderr: `[安全拦截] ${danger}`, exitCode: 1, timedOut: false };
  }

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stdout.length > maxOutput) stdout = stdout.slice(0, maxOutput) + "\n...[输出被截断]";
      if (stderr.length > maxOutput) stderr = stderr.slice(0, maxOutput) + "\n...[输出被截断]";
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut: killed });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: 1, timedOut: false });
    });
  });
}
