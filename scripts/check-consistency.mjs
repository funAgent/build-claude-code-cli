#!/usr/bin/env node

/**
 * 课程一致性校验脚本
 *
 * 检查项：
 * 1. 文件完整性 — 每课是否有源码、文档、场景、注解、终端录制
 * 2. VERSION_META 对齐 — loc 是否与实际代码行数接近
 * 3. prevVersion 链 — 是否形成正确的顺序链
 * 4. 源码递增性 — 后一课是否包含前一课的核心文件
 * 5. 动态导入注册 — 三个组件是否注册了所有课程
 *
 * Usage:
 *   node scripts/check-consistency.mjs            # 校验全部
 *   node scripts/check-consistency.mjs --from s06  # 从 s06 开始校验
 *   node scripts/check-consistency.mjs --verbose   # 详细输出
 */

import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const DOCS_DIR = join(ROOT, "docs");
const WEB_DATA = join(ROOT, "web", "src", "data");
const CONSTANTS_PATH = join(ROOT, "web", "src", "lib", "constants.ts");

const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const fromLesson = fromIdx !== -1 ? args[fromIdx + 1] : null;
const verbose = args.includes("--verbose");

let errors = 0;
let warnings = 0;

function error(msg) {
  errors++;
  console.error(`  ✗ ${msg}`);
}

function warn(msg) {
  warnings++;
  console.warn(`  ⚠ ${msg}`);
}

function ok(msg) {
  if (verbose) console.log(`  ✓ ${msg}`);
}

function countLoc(content) {
  return content
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t !== "" && !t.startsWith("//");
    }).length;
}

function getLessons() {
  const dirs = readdirSync(AGENTS_DIR)
    .filter((d) => /^s\d+-/.test(d) && statSync(join(AGENTS_DIR, d)).isDirectory())
    .sort((a, b) => {
      const na = parseInt(a.match(/^s(\d+)/)[1], 10);
      const nb = parseInt(b.match(/^s(\d+)/)[1], 10);
      return na - nb;
    });

  return dirs.map((dir) => {
    const match = dir.match(/^(s\d+)-(.+)$/);
    return { id: match[1], name: match[2], dir };
  });
}

function getTsFiles(dir) {
  const files = [];
  function scan(d, prefix) {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) scan(join(d, entry.name), p);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(p);
    }
  }
  scan(dir, "");
  return files.sort();
}

function getActualLoc(lessonDir) {
  const srcDir = join(AGENTS_DIR, lessonDir, "src");
  if (!existsSync(srcDir)) return 0;
  let total = 0;
  const files = getTsFiles(srcDir);
  for (const f of files) {
    total += countLoc(readFileSync(join(srcDir, f), "utf-8"));
  }
  return total;
}

function parseVersionMeta() {
  const content = readFileSync(CONSTANTS_PATH, "utf-8");
  const meta = {};

  const metaBlock = content.match(/VERSION_META[^{]*\{([\s\S]*)\};/);
  if (!metaBlock) return meta;

  // NOTE: [^}]+ assumes VERSION_META entries are flat single-level objects
  // with no nested braces in string values. If the format changes, update this regex.
  const entries = metaBlock[1].matchAll(
    /(s\d+)\s*:\s*\{([^}]+)\}/g
  );
  for (const entry of entries) {
    const id = entry[1];
    const block = entry[2];

    const locMatch = block.match(/loc\s*:\s*(\d+)/);
    const prevMatch = block.match(/prevVersion\s*:\s*(?:"(s\d+)"|null)/);

    meta[id] = {
      loc: locMatch ? parseInt(locMatch[1], 10) : 0,
      prevVersion: prevMatch ? (prevMatch[1] || null) : null,
    };
  }
  return meta;
}

function getRegisteredImports(filePath) {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8");
  const ids = new Set();
  const matches = content.matchAll(/\b(s\d+)\b\s*:/g);
  for (const m of matches) ids.add(m[1]);
  return ids;
}

// ── Main ──

console.log("Build Claude Code — 课程一致性校验\n");

const lessons = getLessons();
const versionMeta = parseVersionMeta();
const startIdx = fromLesson
  ? lessons.findIndex((l) => l.id === fromLesson)
  : 0;

if (fromLesson && startIdx === -1) {
  console.error(`找不到课程 ${fromLesson}`);
  process.exit(1);
}

const targetLessons = lessons.slice(startIdx);

// ── 1. 文件完整性 ──

console.log("1. 文件完整性检查");

for (const lesson of targetLessons) {
  const srcDir = join(AGENTS_DIR, lesson.dir, "src");
  const docZh = join(DOCS_DIR, "zh");
  const scenario = join(WEB_DATA, "scenarios", `${lesson.id}.json`);
  const annotation = join(WEB_DATA, "annotations", `${lesson.id}.json`);
  const recording = join(WEB_DATA, "terminal-recordings", `${lesson.id}.json`);

  if (!existsSync(srcDir)) error(`${lesson.id}: 缺少 agents/${lesson.dir}/src/ 目录`);
  else ok(`${lesson.id}: 源码目录存在`);

  const zhDocs = existsSync(docZh) ? readdirSync(docZh).filter((f) => f.startsWith(lesson.id + "-")) : [];
  if (zhDocs.length === 0) error(`${lesson.id}: 缺少中文教学文档 docs/zh/${lesson.id}-*.md`);
  else ok(`${lesson.id}: 中文文档存在`);

  if (!existsSync(scenario)) warn(`${lesson.id}: 缺少 web/src/data/scenarios/${lesson.id}.json`);
  else ok(`${lesson.id}: 场景数据存在`);

  if (!existsSync(annotation)) warn(`${lesson.id}: 缺少 web/src/data/annotations/${lesson.id}.json`);
  else ok(`${lesson.id}: 注解数据存在`);

  if (!existsSync(recording)) warn(`${lesson.id}: 缺少 web/src/data/terminal-recordings/${lesson.id}.json`);
  else ok(`${lesson.id}: 终端录制存在`);
}

// ── 2. VERSION_META 对齐 ──

console.log("\n2. VERSION_META 对齐检查");

const locByLesson = new Map();
for (const lesson of lessons) {
  locByLesson.set(lesson.id, getActualLoc(lesson.dir));
}

for (const lesson of targetLessons) {
  const meta = versionMeta[lesson.id];
  if (!meta) {
    error(`${lesson.id}: 在 constants.ts VERSION_META 中未找到条目`);
    continue;
  }

  const totalLoc = locByLesson.get(lesson.id) ?? 0;
  const prevLoc = meta.prevVersion ? (locByLesson.get(meta.prevVersion) ?? 0) : 0;
  const deltaLoc = totalLoc - prevLoc;
  const declaredLoc = meta.loc;
  const diff = Math.abs(deltaLoc - declaredLoc);
  const pct = declaredLoc > 0 ? (diff / declaredLoc) * 100 : 100;

  if (pct > 100 && diff > 100) {
    warn(`${lesson.id}: LOC 偏差较大 — 声明新增 ${declaredLoc}，实际新增 ~${deltaLoc}（总计 ${totalLoc}）`);
  } else {
    ok(`${lesson.id}: LOC 匹配 — 声明新增 ${declaredLoc}，实际新增 ~${deltaLoc}`);
  }
}

// ── 3. prevVersion 链 ──

console.log("\n3. prevVersion 链检查");

for (let i = 0; i < lessons.length; i++) {
  const lesson = lessons[i];
  const meta = versionMeta[lesson.id];
  if (!meta) continue;

  const expectedPrev = i > 0 ? lessons[i - 1].id : null;
  if (meta.prevVersion !== expectedPrev) {
    error(
      `${lesson.id}: prevVersion 应为 ${expectedPrev ?? "null"}，实际为 ${meta.prevVersion ?? "null"}`
    );
  } else {
    ok(`${lesson.id}: prevVersion 链正确`);
  }
}

// ── 4. 源码递增性（跨课文件检查）──

console.log("\n4. 源码递增性检查");

for (let i = startIdx; i < lessons.length; i++) {
  if (i === 0) continue;
  const prev = lessons[i - 1];
  const curr = lessons[i];

  const prevFiles = new Set(
    getTsFiles(join(AGENTS_DIR, prev.dir, "src"))
  );
  const currFiles = new Set(
    getTsFiles(join(AGENTS_DIR, curr.dir, "src"))
  );

  const disappeared = [];
  for (const f of prevFiles) {
    if (!currFiles.has(f)) disappeared.push(f);
  }

  if (disappeared.length > 0 && disappeared.length <= 3) {
    warn(
      `${curr.id}: 前一课 ${prev.id} 的文件在本课中消失: ${disappeared.join(", ")}`
    );
  } else if (disappeared.length > 3) {
    warn(
      `${curr.id}: 前一课 ${prev.id} 有 ${disappeared.length} 个文件在本课中消失（可能是重构）`
    );
  } else {
    ok(`${curr.id}: 包含前一课的所有文件`);
  }
}

// ── 5. 动态导入注册 ──

console.log("\n5. 动态导入注册检查");

const componentFiles = [
  { path: join(ROOT, "web", "src", "components", "terminal", "terminal-player.tsx"), name: "terminal-player" },
  { path: join(ROOT, "web", "src", "components", "deep-dive", "annotation-viewer.tsx"), name: "annotation-viewer" },
  { path: join(ROOT, "web", "src", "components", "simulator", "agent-loop-simulator.tsx"), name: "agent-loop-simulator" },
];

for (const comp of componentFiles) {
  const registered = getRegisteredImports(comp.path);
  for (const lesson of targetLessons) {
    if (!registered.has(lesson.id)) {
      warn(`${lesson.id}: 未在 ${comp.name}.tsx 中注册动态导入`);
    } else {
      ok(`${lesson.id}: ${comp.name} 已注册`);
    }
  }
}

// ── Summary ──

console.log("\n" + "─".repeat(50));
if (errors === 0 && warnings === 0) {
  console.log("✓ 所有检查通过");
} else {
  if (errors > 0) console.log(`✗ ${errors} 个错误`);
  if (warnings > 0) console.log(`⚠ ${warnings} 个警告`);
}
console.log("");

process.exit(errors > 0 ? 1 : 0);
