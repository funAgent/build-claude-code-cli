/**
 * s32 — BashTool（增加 checkPermissions）
 *
 * bash 是最危险的工具——可以执行任意命令。
 * checkPermissions 根据命令内容判断安全级别：
 * - 只读命令（ls, cat, echo 等）→ allow
 * - 危险命令（rm -rf, sudo 等）→ deny
 * - 其他命令 → ask
 *
 * 对照 Claude Code: BashTool.checkPermissions()
 * 生产版有完整的 shell 命令分类器和正则匹配。
 */
import { spawn } from "node:child_process";
import { buildTool, type ToolResult } from "../tool.js";
import type { PermissionDecision } from "../permissions.js";

async function exec(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const c = spawn("sh", ["-c", cmd], { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = ""; const m = 1024 * 1024;
    const t = setTimeout(() => c.kill("SIGTERM"), 30_000);
    c.stdout.on("data", (d: Buffer) => { if (o.length < m) o += d.toString(); });
    c.stderr.on("data", (d: Buffer) => { if (e.length < m) e += d.toString(); });
    c.on("close", (code) => { clearTimeout(t); resolve({ stdout: o, stderr: e, exitCode: code ?? 1 }); });
    c.on("error", (err) => { clearTimeout(t); resolve({ stdout: "", stderr: err.message, exitCode: 1 }); });
  });
}

const SAFE_COMMANDS = /^\s*(ls|cat|echo|pwd|wc|head|tail|grep|find|which|type|file|stat|du|df|date|uname|whoami|env|printenv|node\s+--version|npm\s+(--version|ls|list)|git\s+(status|log|diff|branch|remote|show|rev-parse))\b/;
const DANGEROUS_PATTERNS = /\b(rm\s+-rf\s+\/|sudo|chmod\s+777|mkfs|dd\s+if=|>\s*\/dev\/|shutdown|reboot|kill\s+-9\s+1\b|curl.*\|\s*sh)\b/;

function checkBashPermissions(input: Record<string, unknown>): PermissionDecision {
  const command = (input.command as string) ?? "";

  if (DANGEROUS_PATTERNS.test(command)) {
    return { behavior: "deny", message: `危险命令被阻止: ${command.slice(0, 80)}` };
  }

  if (SAFE_COMMANDS.test(command)) {
    return { behavior: "allow", message: "安全的只读命令" };
  }

  return { behavior: "ask", message: `需要确认执行: ${command.slice(0, 80)}` };
}

export const bashTool = buildTool({
  name: "bash", description: "Execute a shell command.",
  inputSchema: { type: "object" as const, properties: { command: { type: "string", description: "Shell command" } }, required: ["command"] },
  checkPermissions: checkBashPermissions,
  async call(input, ctx): Promise<ToolResult> {
    const r = await exec((input as { command: string }).command, ctx.cwd);
    return { output: r.stderr ? `${r.stdout}\nstderr: ${r.stderr}` : r.stdout || "(no output)", isError: r.exitCode !== 0 };
  },
});
