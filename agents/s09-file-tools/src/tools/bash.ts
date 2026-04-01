/**
 * BashTool（复用 s08）
 */

import { spawn } from "node:child_process";
import { buildTool, type ToolResult } from "../tool.js";

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*)?.*\s+\/(?!\w)/,
  /\bmkfs\b/,
  /\bdd\b.*\bof=\/dev\//,
  /\bshutdown\b/,
  /\breboot\b/,
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return `危险命令: ${pattern.source}`;
  }
  return null;
}

async function execShell(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const danger = isDangerous(command);
  if (danger) return { stdout: "", stderr: `[安全拦截] ${danger}`, exitCode: 1 };

  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const max = 1024 * 1024;
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (c: Buffer) => { if (stdout.length < max) stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { if (stderr.length < max) stderr += c.toString(); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? 1 }); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ stdout: "", stderr: e.message, exitCode: 1 }); });
  });
}

export const bashTool = buildTool({
  name: "bash",
  description: "Execute a shell command.",
  inputSchema: {
    type: "object" as const,
    properties: { command: { type: "string", description: "The shell command to execute" } },
    required: ["command"],
  },
  async call(input, context): Promise<ToolResult> {
    const { command } = input as { command: string };
    const r = await execShell(command, context.cwd);
    const output = r.stderr ? `${r.stdout}\nstderr: ${r.stderr}\nexit: ${r.exitCode}` : r.stdout || "(no output)";
    return { output, isError: r.exitCode !== 0 };
  },
});
