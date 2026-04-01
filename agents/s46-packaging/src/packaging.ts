/**
 * s46 — 打包与分发
 *
 * 如果用户不能一条命令安装，他们就不会用。
 * 打包不只是编译——是把产品变成任何人都能用的东西。
 *
 * 关键流程：
 * 1. esbuild/bun 单文件打包
 * 2. package.json 配置：bin、exports、files
 * 3. npm publish 发布
 * 4. 自动更新检查
 *
 * 对照 Claude Code:
 * - build.mjs: esbuild 构建脚本
 * - package.json: bin, exports, files 配置
 * - 自动更新: npm/GCS 版本检查
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── 类型定义 ─────────────────────────────────────────────────

export interface PackageConfig {
  name: string;
  version: string;
  description: string;
  bin: Record<string, string>;
  main: string;
  files: string[];
}

export interface BuildConfig {
  entryPoint: string;
  outDir: string;
  target: "node" | "bun";
  minify: boolean;
  sourcemap: boolean;
  external: string[];
}

// ── 构建 ─────────────────────────────────────────────────────

/**
 * 执行构建。
 *
 * 对照 Claude Code: build.mjs
 * - esbuild 单文件打包
 * - 外部化 native 依赖
 * - sourcemap 生成
 */
export function build(config: BuildConfig): { success: boolean; error?: string } {
  const { entryPoint, outDir, target, minify, external } = config;

  mkdirSync(outDir, { recursive: true });

  const externalArgs = external.map((e) => `--external:${e}`).join(" ");
  const minifyFlag = minify ? "--minify" : "";

  const cmd =
    target === "bun"
      ? `bun build ${entryPoint} --outdir ${outDir} --target bun ${minifyFlag}`
      : `npx esbuild ${entryPoint} --bundle --platform=node --outdir=${outDir} ${externalArgs} ${minifyFlag}`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ── package.json 生成 ────────────────────────────────────────

/**
 * 生成发布用的 package.json。
 *
 * 对照 Claude Code: package.json 配置
 * - bin: CLI 入口
 * - files: 只发布 dist/
 * - exports: ESM 入口
 */
export function generatePackageJson(config: PackageConfig): Record<string, unknown> {
  return {
    name: config.name,
    version: config.version,
    description: config.description,
    type: "module",
    bin: config.bin,
    main: config.main,
    files: config.files,
    engines: { node: ">=18.0.0" },
    scripts: {
      build: "node build.mjs",
      prepublishOnly: "npm run build",
    },
  };
}

// ── 版本管理 ─────────────────────────────────────────────────

/**
 * 检查是否有新版本可用。
 *
 * 对照 Claude Code: 自动更新检查
 */
export function checkForUpdates(
  packageName: string,
  currentVersion: string,
): { hasUpdate: boolean; latestVersion?: string } {
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    if (result && result !== currentVersion) {
      return { hasUpdate: true, latestVersion: result };
    }
    return { hasUpdate: false };
  } catch {
    return { hasUpdate: false };
  }
}

/**
 * Semver 比较。
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const [cMaj, cMin, cPatch] = current.split(".").map(Number);
  const [lMaj, lMin, lPatch] = latest.split(".").map(Number);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

// ── 发布 ─────────────────────────────────────────────────────

/**
 * 发布到 npm。
 */
export function publish(
  packageDir: string,
  options: { dryRun?: boolean; tag?: string } = {},
): { success: boolean; error?: string } {
  const dryRunFlag = options.dryRun ? "--dry-run" : "";
  const tagFlag = options.tag ? `--tag ${options.tag}` : "";

  try {
    execSync(`npm publish ${dryRunFlag} ${tagFlag}`, {
      cwd: packageDir,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
