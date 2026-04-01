/**
 * s38 — Plugin System
 *
 * 插件系统把你的产品从工具变成平台——生态是护城河。
 * 第三方可以通过插件扩展 Agent 的能力，而不需要修改核心代码。
 *
 * 关键流程：
 * 1. 插件发现 → 从 marketplace 或本地目录加载
 * 2. 插件验证 → 校验 manifest 格式和安全约束
 * 3. 插件注册 → 注入工具、MCP 服务器、hooks
 * 4. 插件管理 → install / uninstall / enable / disable
 *
 * 对照 Claude Code:
 * - utils/plugins/pluginLoader.ts (~500 行): 发现与加载
 * - services/plugins/pluginOperations.ts (~400 行): 安装/卸载
 * - utils/plugins/marketplaceManager.ts: marketplace
 * - utils/plugins/pluginPolicy.ts: 安全策略
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * 插件 Manifest（plugin.json）。
 * 对照 Claude Code: PluginManifestSchema
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  mcpServers?: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >;
  hooks?: {
    onStartup?: string;
    onShutdown?: string;
  };
  permissions?: string[];
}

/**
 * 已加载的插件。
 * 对照 Claude Code: LoadedPlugin
 */
export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  path: string;
  source: PluginSource;
  enabled: boolean;
}

export type PluginSource = "marketplace" | "local" | "session";

/**
 * 插件注册表。
 */
interface PluginRegistry {
  plugins: Map<string, LoadedPlugin>;
}

// ── 插件注册表 ───────────────────────────────────────────────

const registry: PluginRegistry = { plugins: new Map() };

export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(registry.plugins.values());
}

export function getPlugin(id: string): LoadedPlugin | undefined {
  return registry.plugins.get(id);
}

// ── 插件发现与加载 ───────────────────────────────────────────

/**
 * 获取插件安装目录。
 */
function getPluginsDir(): string {
  const dir = join(homedir(), ".agent-cli", "plugins");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取插件缓存目录（marketplace 下载后的存储位置）。
 * 对照 Claude Code: getVersionedCachePath
 */
function getPluginCacheDir(): string {
  const dir = join(homedir(), ".agent-cli", "plugins", "cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 加载所有已安装的插件。
 *
 * 对照 Claude Code: loadAllPlugins / loadAllPluginsCacheOnly
 * - 扫描插件目录
 * - 读取 plugin.json
 * - 验证 manifest
 * - 返回 LoadedPlugin 列表
 */
export function loadAllPlugins(): LoadedPlugin[] {
  const pluginsDir = getPluginsDir();
  const loaded: LoadedPlugin[] = [];

  if (!existsSync(pluginsDir)) return loaded;

  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "cache") continue;

    const pluginDir = join(pluginsDir, entry.name);
    const manifestPath = join(pluginDir, "plugin.json");

    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
      const validation = validateManifest(manifest);

      if (!validation.valid) {
        console.error(`插件 ${entry.name} manifest 无效: ${validation.error}`);
        continue;
      }

      const plugin: LoadedPlugin = {
        id: manifest.name,
        manifest,
        path: pluginDir,
        source: "local",
        enabled: isPluginEnabled(manifest.name),
      };

      loaded.push(plugin);
      registry.plugins.set(plugin.id, plugin);
    } catch (error) {
      console.error(`加载插件 ${entry.name} 失败:`, error);
    }
  }

  return loaded;
}

// ── 插件验证 ─────────────────────────────────────────────────

/**
 * 验证插件 manifest。
 *
 * 对照 Claude Code: PluginManifestSchema (Zod schema)
 * 安全检查:
 * - 必需字段完整
 * - 版本格式合法
 * - 路径安全（无目录穿越）
 */
export function validateManifest(
  manifest: unknown,
): { valid: true } | { valid: false; error: string } {
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, error: "manifest 不是有效对象" };
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== "string" || !m.name) {
    return { valid: false, error: "缺少 name 字段" };
  }

  if (typeof m.version !== "string" || !m.version) {
    return { valid: false, error: "缺少 version 字段" };
  }

  if (!/^\d+\.\d+\.\d+/.test(m.version as string)) {
    return { valid: false, error: "version 格式无效（需要 semver）" };
  }

  if (typeof m.description !== "string") {
    return { valid: false, error: "缺少 description 字段" };
  }

  if ((m.name as string).includes("..") || (m.name as string).includes("/")) {
    return { valid: false, error: "name 包含非法字符" };
  }

  return { valid: true };
}

// ── 插件管理 ─────────────────────────────────────────────────

/**
 * 安装插件（从 marketplace 或本地路径）。
 *
 * 对照 Claude Code: pluginOperations.ts → install
 */
export function installPlugin(
  nameOrPath: string,
  source: PluginSource = "marketplace",
): { success: boolean; error?: string } {
  if (source === "local") {
    return installFromLocal(nameOrPath);
  }
  return installFromMarketplace(nameOrPath);
}

function installFromLocal(localPath: string): { success: boolean; error?: string } {
  const manifestPath = join(localPath, "plugin.json");
  if (!existsSync(manifestPath)) {
    return { success: false, error: `未找到 plugin.json: ${manifestPath}` };
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const plugin: LoadedPlugin = {
      id: manifest.name,
      manifest,
      path: localPath,
      source: "local",
      enabled: true,
    };

    registry.plugins.set(plugin.id, plugin);
    setPluginEnabled(plugin.id, true);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

function installFromMarketplace(
  pluginId: string,
): { success: boolean; error?: string } {
  // 教学版简化：marketplace 概念展示
  // 对照 Claude Code: marketplaceManager.getPluginById → 下载 → 缓存
  return {
    success: false,
    error: `Marketplace 安装 '${pluginId}' — 需要实现 marketplace API 集成`,
  };
}

/**
 * 卸载插件。
 */
export function uninstallPlugin(pluginId: string): { success: boolean; error?: string } {
  const plugin = registry.plugins.get(pluginId);
  if (!plugin) {
    return { success: false, error: `插件 '${pluginId}' 未安装` };
  }

  registry.plugins.delete(pluginId);
  setPluginEnabled(pluginId, false);
  return { success: true };
}

/**
 * 启用/禁用插件。
 */
export function enablePlugin(pluginId: string): boolean {
  const plugin = registry.plugins.get(pluginId);
  if (!plugin) return false;
  plugin.enabled = true;
  setPluginEnabled(pluginId, true);
  return true;
}

export function disablePlugin(pluginId: string): boolean {
  const plugin = registry.plugins.get(pluginId);
  if (!plugin) return false;
  plugin.enabled = false;
  setPluginEnabled(pluginId, false);
  return true;
}

// ── 插件扩展点 ───────────────────────────────────────────────

/**
 * 获取所有启用插件提供的 MCP 服务器配置。
 *
 * 对照 Claude Code: getPluginMcpServers()
 * - 遍历已启用插件
 * - 提取 manifest.mcpServers
 * - 与用户配置签名去重
 */
export function getPluginMcpServers(): Record<
  string,
  { command: string; args?: string[]; env?: Record<string, string> }
> {
  const servers: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  > = {};

  for (const plugin of registry.plugins.values()) {
    if (!plugin.enabled || !plugin.manifest.mcpServers) continue;

    for (const [name, config] of Object.entries(plugin.manifest.mcpServers)) {
      servers[`${plugin.id}/${name}`] = config;
    }
  }

  return servers;
}

// ── 插件策略 ─────────────────────────────────────────────────

/**
 * 检查插件是否被策略允许。
 *
 * 对照 Claude Code: pluginPolicy.ts
 * - enabledPlugins[pluginId] === false → 禁止
 * - 企业管理策略
 * - blocklist / allowlist
 */
export function isPluginAllowed(pluginId: string): boolean {
  // 教学版简化：所有插件都允许
  // 生产版需要检查企业策略 + blocklist
  return true;
}

// ── 持久化状态 ───────────────────────────────────────────────

function getPluginStatePath(): string {
  return join(homedir(), ".agent-cli", "plugin-state.json");
}

function loadPluginState(): Record<string, boolean> {
  const path = getPluginStatePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function savePluginState(state: Record<string, boolean>): void {
  writeFileSync(getPluginStatePath(), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function isPluginEnabled(pluginId: string): boolean {
  const state = loadPluginState();
  return state[pluginId] !== false;
}

function setPluginEnabled(pluginId: string, enabled: boolean): void {
  const state = loadPluginState();
  state[pluginId] = enabled;
  savePluginState(state);
}
