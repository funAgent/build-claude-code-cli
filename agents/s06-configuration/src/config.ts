/**
 * s06 — 多层配置管理
 *
 * 配置优先级链（高 → 低）：
 * CLI 参数 → 环境变量 → 项目配置 → 全局配置 → 默认值
 *
 * 对照 Claude Code: utils/config.ts
 * 生产版支持更多层级和配置验证
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface AppConfig {
  model: string;
  maxTurns: number;
  timeout: number;
  maxOutput: number;
  systemPrompt: string;
}

const DEFAULTS: AppConfig = {
  model: "claude-sonnet-4-20250514",
  maxTurns: 10,
  timeout: 30_000,
  maxOutput: 1024 * 1024,
  systemPrompt:
    "You are a helpful CLI assistant. You can execute shell commands using the bash tool.",
};

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".mycli", "config.json");
const PROJECT_CONFIG_NAME = ".mycli.json";

function loadJsonFile(filePath: string): Partial<AppConfig> {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    return {};
  }
}

function findProjectConfig(): Partial<AppConfig> {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    const configPath = path.join(dir, PROJECT_CONFIG_NAME);
    if (fs.existsSync(configPath)) {
      return loadJsonFile(configPath);
    }
    dir = path.dirname(dir);
  }
  return {};
}

function loadEnvConfig(): Partial<AppConfig> {
  const config: Partial<AppConfig> = {};
  if (process.env.MYCLI_MODEL) config.model = process.env.MYCLI_MODEL;
  if (process.env.MYCLI_MAX_TURNS) config.maxTurns = parseInt(process.env.MYCLI_MAX_TURNS, 10);
  if (process.env.MYCLI_TIMEOUT) config.timeout = parseInt(process.env.MYCLI_TIMEOUT, 10);
  return config;
}

export function loadConfig(cliOverrides: Partial<AppConfig> = {}): AppConfig {
  const globalConfig = loadJsonFile(GLOBAL_CONFIG_PATH);
  const projectConfig = findProjectConfig();
  const envConfig = loadEnvConfig();

  return {
    ...DEFAULTS,
    ...globalConfig,
    ...projectConfig,
    ...envConfig,
    ...cliOverrides,
  };
}

export function showConfig(config: AppConfig): void {
  console.log("\n--- 当前配置 ---");
  console.log(`模型: ${config.model}`);
  console.log(`最大轮次: ${config.maxTurns}`);
  console.log(`超时: ${config.timeout}ms`);
  console.log(`最大输出: ${config.maxOutput} bytes`);
  console.log(`系统提示: ${config.systemPrompt.slice(0, 60)}...`);
}
