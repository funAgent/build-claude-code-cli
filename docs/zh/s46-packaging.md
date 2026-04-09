# s46 — 打包与分发

> **Motto:** If users can't install it in one command, they won't use it

`[ Phase 4: 发布与分发 ]` · 主题：esbuild 单文件打包、package.json 配置、npm 发布与自动更新检查

---

## 问题场景

你的 CLI Agent 已经功能完善，但它还是一堆 `.ts` 源文件——用户不可能 `git clone` 然后自己编译。你需要：

- **一条命令安装**：`npm install -g your-cli`，装完就能用。
- **单文件产物**：不依赖 `node_modules` 目录结构，启动快、部署简单。
- **版本管理**：用户能查看当前版本，并在有新版本时收到提示。
- **发布流程**：`npm publish` 一步上架，支持 dry-run 和 tag（beta/latest）。

打包不只是 `tsc` 编译——是把一个开发项目变成**任何人都能用的产品**。

## 设计决策

| 决策 | 理由 |
|------|------|
| **esbuild 单文件 bundle** | 启动快（无需解析 `node_modules`）、部署简单（一个 `.js` 文件）、可预测（不受用户本地包版本影响） |
| **external native 依赖** | `fsevents` 等原生模块无法打进 bundle，需 `--external` 排除 |
| **bin 字段声明 CLI 入口** | `npm install -g` 后自动建立 symlink，用户直接输命令名即可执行 |
| **files 字段控制发布内容** | 只发布 `dist/`，避免源码、测试、配置文件泄露到 npm 包 |
| **engines 字段声明 Node 版本** | 安装时警告不兼容的 Node 版本，减少「你的环境跑不了」工单 |
| **npm view 检查更新** | 轻量级更新检查，无需额外服务；生产版可加 GCS/CDN 版本文件 |

### 构建到安装全流程

```
从源码到用户手中的完整链路：

  src/cli.ts
     │
     ▼
  esbuild --bundle --platform=node
     │  外部化: fsevents, sharp 等 native 模块
     │  可选: --minify（减小体积）
     │  可选: --sourcemap（保留调试能力）
     ▼
  dist/cli.js  (~4.2MB 单文件)
     │
     ▼
  package.json
     │  "bin": { "claude-code": "dist/cli.js" }
     │  "files": ["dist"]
     │  "engines": { "node": ">=18.0.0" }
     ▼
  npm publish --access public
     │
     ▼
  registry.npmjs.org
     │
     ▼
  用户: npm install -g @anthropic-ai/claude-code
     │  → symlink claude-code → dist/cli.js
     ▼
  claude-code --version
     │  → 2.4.1
     ▼
  npm outdated -g  /  内置更新检查
     │  → "2.4.2 available"
```

## 实现要点

### 1. `build(config)` — 单文件打包

```typescript
export function build(config: BuildConfig): { success: boolean; error?: string } {
  const { entryPoint, outDir, target, minify, external } = config;
  mkdirSync(outDir, { recursive: true });

  const externalArgs = external.map((e) => `--external:${e}`).join(" ");
  const minifyFlag = minify ? "--minify" : "";

  const cmd = target === "bun"
    ? `bun build ${entryPoint} --outdir ${outDir} --target bun ${minifyFlag}`
    : `npx esbuild ${entryPoint} --bundle --platform=node --outdir=${outDir} ${externalArgs} ${minifyFlag}`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

关键参数：

- `--bundle`：将所有 `import` 打进一个文件。
- `--platform=node`：保留 Node.js 内置模块（`fs`、`path` 等）不打包。
- `--external`：native 模块（如 `fsevents`）无法序列化为 JS，必须排除。
- `--minify`：生产发布时压缩，减小约 30-50% 体积。

### 2. `generatePackageJson(config)` — 发布配置

```typescript
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
```

各字段职责：

- **`bin`**：`{ "claude-code": "dist/cli.js" }` — `npm install -g` 后创建可执行 symlink。
- **`files`**：`["dist"]` — 只把构建产物发布到 npm，源码不上传。
- **`engines`**：`{ "node": ">=18.0.0" }` — 低版本 Node 安装时发出警告。
- **`prepublishOnly`**：发布前自动执行构建，防止忘记 build 就 publish。
- **`type: "module"`**：声明为 ESM 包。

### 3. `checkForUpdates` + `isNewerVersion` — 版本检查

```typescript
export function checkForUpdates(packageName, currentVersion) {
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: "utf-8", stdio: "pipe",
    }).trim();

    if (result && result !== currentVersion) {
      return { hasUpdate: true, latestVersion: result };
    }
    return { hasUpdate: false };
  } catch {
    return { hasUpdate: false };
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const [cMaj, cMin, cPatch] = current.split(".").map(Number);
  const [lMaj, lMin, lPatch] = latest.split(".").map(Number);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}
```

设计考量：

- **静默失败**：`npm view` 可能因网络问题失败，`catch` 后返回"无更新"而非报错——更新检查不应阻断正常使用。
- **Semver 比较**：先比 major、再 minor、再 patch，遵循语义化版本规范。
- **调用时机**：通常在 CLI 启动后异步检查，结果缓存到本地文件（如 `~/.claude-code/last-update-check`），避免每次启动都请求 registry。

### 4. `publish(packageDir, options)` — 发布到 npm

```typescript
export function publish(packageDir, options = {}) {
  const dryRunFlag = options.dryRun ? "--dry-run" : "";
  const tagFlag = options.tag ? `--tag ${options.tag}` : "";

  try {
    execSync(`npm publish ${dryRunFlag} ${tagFlag}`, {
      cwd: packageDir, encoding: "utf-8", stdio: "pipe",
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

发布流程最佳实践：

1. **先 dry-run**：`publish({ dryRun: true })` 预览将要上传的文件列表，确认无敏感信息。
2. **beta 标签**：`publish({ tag: 'beta' })` 发布到 beta 频道，用户需 `npm install pkg@beta` 显式安装。
3. **CI 自动发布**：在 GitHub Actions 中配置 `NPM_TOKEN`，tag push 触发自动 publish。

## 运行验证

```bash
cd agents/s46-packaging

# 1. 执行构建
npm run build
# → esbuild src/cli.tsx --bundle --platform=node ...
# → dist/cli.mjs 生成成功

# 2. 验证构建产物可运行
node dist/cli.mjs --version
# → 输出版本号

# 3. 检查打包内容（不实际发布）
npm pack --dry-run
# → 确认只包含 dist/ 和 package.json
# → 不应包含 src/、.env、tsconfig.json 等

# 4. 验证更新检查（静默失败）
#    → checkForUpdates() 网络不可用时返回 { hasUpdate: false }
#    → 不阻断正常使用
```

## 对照 Claude Code 表格

| 概念 | Claude Code 中的位置 | 说明 |
|------|----------------------|------|
| 构建脚本 | `build.mjs` / `scripts/build` | esbuild 配置：入口、外部化、sourcemap、Bun target |
| 包配置 | `package.json` — `bin`, `files`, `exports` | `bin` 声明 `claude` 命令；`files` 只含 `dist/`；`exports` 支持 ESM |
| 版本管理 | `package.json` `version` + release 脚本 | 语义化版本 + changelog 生成 + git tag |
| 更新检查 | npm registry / GCS 版本文件 | 启动时异步检查，缓存结果避免频繁请求 |
| 多平台产物 | 构建矩阵 + 平台特定二进制 | macOS / Linux / Windows 各自的 artifact |
| 签名验证 | 发布流程中的代码签名 | 验证产物完整性，防止供应链攻击 |

> 教学版聚焦 `build → publish → install` 核心链路；生产版还包含签名、多平台 artifact、changelog 生成和 CI/CD 自动化。

## 深入思考

1. **单文件 bundle 的权衡**：启动更快（不遍历 `node_modules`），但调试困难（stack trace 指向压缩后的代码）。生产版通过 `--sourcemap=external` 将 `.map` 文件单独发布，在错误上报时还原原始位置。
2. **`prepublishOnly` vs `prepare`**：`prepublishOnly` 只在 `npm publish` 时触发；`prepare` 还会在 `npm install`（从 git）时触发。CLI 工具选 `prepublishOnly` 更精确——避免从 git 安装时触发不必要的构建。
3. **自动更新的侵入度**：更新检查不应阻塞启动。Claude Code 的做法是后台异步检查 + 本地缓存 + 非阻塞提示。若用户明确拒绝更新提示，应尊重 `--no-update-check` 标志。
4. **供应链安全**：`npm publish` 上传的产物任何人可安装。生产级发布需要：`npm provenance`（证明构建来源）、lockfile 固定依赖版本、CI 环境构建（避免本地污染）。

## 练习

1. 编写一个最小 `build.mjs`：用 esbuild API（非 CLI）打包 `src/cli.ts` 到 `dist/cli.js`，外部化 `@anthropic-ai/sdk`，生成 sourcemap。
2. 创建一个完整的 `package.json`：包含 `bin`、`files`、`engines`、`exports`、`prepublishOnly` 脚本，用 `npm pack` 验证打包内容（不实际发布）。
3. 实现 `checkForUpdates` 的缓存版本：将上次检查时间写入 `~/.config/your-cli/update-check.json`，24 小时内不重复查询。
4. 用 `npm publish --dry-run` 检查你的包：确认 `files` 字段正确过滤了源码、测试、`.env` 等敏感文件。
5. 设计一个 CI 发布流程（GitHub Actions）：`main` 分支 push 时自动 `npm version patch`、构建、测试、publish，并在失败时发送通知。
