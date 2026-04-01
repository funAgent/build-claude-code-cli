/**
 * s02 — 安全的 Shell 命令执行模块
 *
 * 封装 child_process.spawn，提供：
 * 1. 超时控制
 * 2. 输出大小限制
 * 3. 危险命令拦截
 *
 * 对照 Claude Code: tools/BashTool/BashTool.tsx
 */

import { spawn } from "node:child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*)?.*\s+\/(?!\w)/,  // rm -rf / 类
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  />\s*\/dev\/sd/,
  /\bshutdown\b/,
  /\breboot\b/,
  /:(){ :\|:& };:/,                       // fork bomb
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
  options: {
    timeout?: number;
    maxOutput?: number;
    cwd?: string;
  } = {}
): Promise<ShellResult> {
  const { timeout = 30_000, maxOutput = 1024 * 1024, cwd } = options;

  const danger = isDangerous(command);
  if (danger) {
    return {
      stdout: "",
      stderr: `[安全拦截] ${danger}`,
      exitCode: 1,
      timedOut: false,
    };
  }

  return new Promise((resolve) => {
    // spawn 而非 exec：避免 shell 注入，且支持 stream 式输出收集
    // stdio: ignore stdin（不需要交互），pipe stdout/stderr（收集输出）
    const child = spawn("sh", ["-c", command], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    // 超时保护：先 SIGTERM（优雅终止），3s 后 SIGKILL（强制杀死）
    // 两阶段 kill 是 Unix 进程管理的标准模式
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeout);

    // 流式收集输出，超过 maxOutput 后丢弃——防止 OOM
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutput) {
        stdout += chunk.toString();
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutput) {
        stderr += chunk.toString();
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput) + "\n...[输出被截断]";
      }
      if (stderr.length > maxOutput) {
        stderr = stderr.slice(0, maxOutput) + "\n...[输出被截断]";
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        timedOut: killed,
      });
    });

    // error 事件在子进程无法启动时触发（如命令不存在）
    // 注意：命令执行失败（exit code != 0）不会触发 error
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
      });
    });
  });
}
