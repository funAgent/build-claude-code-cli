/**
 * s08 — BashTool（重构为 Tool 接口）
 *
 * 从 s07 的 execShell 函数迁移到 Tool 接口。
 * 对照 Claude Code: tools/BashTool/BashTool.tsx
 */

import { spawn } from "node:child_process";
import { buildTool, type ToolResult } from "../tool.js";

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*)?.*\s+\/(?!\w)/,
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  />\s*\/dev\/sd/,
  /\bshutdown\b/,
  /\breboot\b/,
  /:(){ :\|:& };:/,
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return `命令匹配危险模式: ${pattern.source}`;
  }
  return null;
}

async function execShell(
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 30_000, cwd } = options;

  const danger = isDangerous(command);
  if (danger) {
    return { stdout: "", stderr: `[安全拦截] ${danger}`, exitCode: 1 };
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
    const maxOutput = 1024 * 1024;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, timeout);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: killed ? "[超时终止]" : stderr.slice(0, maxOutput),
        exitCode: code ?? 1,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });
  });
}

export const bashTool = buildTool({
  name: "bash",
  description:
    "Execute a shell command. Use for running scripts, installing packages, or system operations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
    },
    required: ["command"],
  },
  isReadOnly: false,
  async call(input, context): Promise<ToolResult> {
    const { command } = input as { command: string };
    const result = await execShell(command, { cwd: context.cwd });

    const output = result.stderr
      ? `${result.stdout}\nstderr: ${result.stderr}\nexit: ${result.exitCode}`
      : result.stdout || "(no output)";

    return {
      output,
      isError: result.exitCode !== 0,
    };
  },
});
