/**
 * BashTool（复用）
 */
import { spawn } from "node:child_process";
import { buildTool, type ToolResult } from "../tool.js";

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

export const bashTool = buildTool({
  name: "bash", description: "Execute a shell command.",
  inputSchema: { type: "object" as const, properties: { command: { type: "string", description: "Shell command" } }, required: ["command"] },
  async call(input, ctx): Promise<ToolResult> {
    const r = await exec((input as { command: string }).command, ctx.cwd);
    return { output: r.stderr ? `${r.stdout}\nstderr: ${r.stderr}` : r.stdout || "(no output)", isError: r.exitCode !== 0 };
  },
});
