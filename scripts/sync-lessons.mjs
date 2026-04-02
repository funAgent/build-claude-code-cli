#!/usr/bin/env node

/**
 * 课程源码同步脚本
 *
 * 当你修改了某课的源码后，此脚本自动将相同的改动传播到后续课程中。
 *
 * 原理：
 *   1. 通过 git diff 获取你在 sXX 中的修改（old text → new text）
 *   2. 在 sXX+1, sXX+2, ..., s48 的同名文件中搜索 old text
 *   3. 找到则替换为 new text；找不到则跳过（该课可能已重写了这部分代码）
 *
 * Usage:
 *   node scripts/sync-lessons.mjs s06              # 同步 s06 的改动到后续课程
 *   node scripts/sync-lessons.mjs s06 --dry-run    # 只预览，不实际修改
 *   node scripts/sync-lessons.mjs s06 --verbose    # 显示详细匹配信息
 *
 * 前提：
 *   - 你的修改尚未 commit（脚本通过 git diff 与 HEAD 对比）
 *   - 或者指定 --committed 来对比 HEAD~1 与 HEAD
 */

import { execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join, resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");

const args = process.argv.slice(2);
const lessonId = args.find((a) => /^s\d+$/.test(a));
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const committed = args.includes("--committed");

if (!lessonId) {
  console.error("Usage: node scripts/sync-lessons.mjs <sXX> [--dry-run] [--verbose] [--committed]");
  console.error("");
  console.error("示例：");
  console.error("  node scripts/sync-lessons.mjs s06              # 同步 s06 的改动");
  console.error("  node scripts/sync-lessons.mjs s06 --dry-run    # 只预览不修改");
  console.error("  node scripts/sync-lessons.mjs s06 --committed  # 对比 HEAD~1 和 HEAD");
  process.exit(1);
}

const lessonNum = parseInt(lessonId.replace("s", ""), 10);

function findLessonDir(id) {
  const dirs = readdirSync(AGENTS_DIR).filter(
    (d) => d.startsWith(id + "-") && statSync(join(AGENTS_DIR, d)).isDirectory()
  );
  return dirs[0] || null;
}

function getAllLessonDirs() {
  return readdirSync(AGENTS_DIR)
    .filter((d) => /^s\d+-/.test(d) && statSync(join(AGENTS_DIR, d)).isDirectory())
    .sort((a, b) => {
      const na = parseInt(a.match(/^s(\d+)/)[1], 10);
      const nb = parseInt(b.match(/^s(\d+)/)[1], 10);
      return na - nb;
    });
}

function getGitDiff(lessonDir) {
  const srcPath = join("agents", lessonDir, "src");
  const relPath = relative(ROOT, join(AGENTS_DIR, lessonDir, "src"));

  try {
    const diffRef = committed ? "HEAD~1..HEAD" : "HEAD";
    const cmd = `git diff ${diffRef} -- "${relPath}"`;
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return "";
  }
}

/**
 * 从 unified diff 中提取 (filename, oldBlock, newBlock) 替换对
 *
 * 策略：将每个 hunk 中连续的 - 行和 + 行提取为 old/new 文本块，
 * 前后各保留若干行上下文用于精确匹配。
 */
function parseDiffToReplacements(diffText) {
  const replacements = [];
  const files = diffText.split(/^diff --git /m).filter(Boolean);

  for (const fileDiff of files) {
    const headerMatch = fileDiff.match(/^a\/agents\/s\d+-[^/]+\/src\/(.+)\s+b\/agents\/s\d+-[^/]+\/src\/(.+)/m);
    if (!headerMatch) continue;
    const filename = headerMatch[2];

    const hunks = fileDiff.split(/^@@\s/m).slice(1);

    for (const hunk of hunks) {
      const lines = hunk.split("\n");

      let i = 0;
      // skip the @@ header line
      if (lines[0] && lines[0].match(/^[-+\d, ]+@@/)) i = 1;

      while (i < lines.length) {
        // collect context before change
        const contextBefore = [];
        while (i < lines.length && lines[i].startsWith(" ")) {
          contextBefore.push(lines[i].substring(1));
          i++;
        }

        // collect removed lines (old)
        const oldLines = [];
        while (i < lines.length && lines[i].startsWith("-")) {
          oldLines.push(lines[i].substring(1));
          i++;
        }

        // collect added lines (new)
        const newLines = [];
        while (i < lines.length && lines[i].startsWith("+")) {
          newLines.push(lines[i].substring(1));
          i++;
        }

        // collect context after change
        const contextAfter = [];
        let peekIdx = i;
        const maxCtx = 3;
        while (peekIdx < lines.length && lines[peekIdx].startsWith(" ") && contextAfter.length < maxCtx) {
          contextAfter.push(lines[peekIdx].substring(1));
          peekIdx++;
        }

        if (oldLines.length === 0 && newLines.length === 0) {
          i++;
          continue;
        }

        // take last N lines of context before as anchor
        const ctxBeforeSlice = contextBefore.slice(-3);

        const oldBlock = [...ctxBeforeSlice, ...oldLines, ...contextAfter].join("\n");
        const newBlock = [...ctxBeforeSlice, ...newLines, ...contextAfter].join("\n");

        if (oldBlock !== newBlock && oldLines.length > 0) {
          replacements.push({ filename, oldBlock, newBlock, oldLines, newLines });
        } else if (oldLines.length === 0 && newLines.length > 0) {
          // pure insertion — use context as anchor
          const anchor = ctxBeforeSlice.join("\n");
          const insertionBlock = [...ctxBeforeSlice, ...newLines].join("\n");
          if (anchor.trim()) {
            replacements.push({
              filename,
              oldBlock: anchor,
              newBlock: insertionBlock,
              oldLines: [],
              newLines,
            });
          }
        }
      }
    }
  }

  return replacements;
}

/**
 * 在目标文件中尝试应用一个替换。
 *
 * 匹配策略（按优先级）：
 *   1. 完整块匹配（含上下文）— 最精确
 *   2. 尾空格容差匹配 — 处理 trailing whitespace 差异
 *   3. 纯变更行匹配（无上下文）— 处理上下文已变化但变更行本身一样的情况
 *
 * 返回 { applied, content, method }
 */
function applyReplacement(content, oldBlock, newBlock, oldLines, newLines) {
  // Strategy 1: exact block match
  if (content.includes(oldBlock)) {
    return { applied: true, content: content.replace(oldBlock, newBlock), method: "exact" };
  }

  // Strategy 2: whitespace-tolerant block match
  const normalizeLines = (s) => s.split("\n").map((l) => l.trimEnd()).join("\n");
  const normalizedOld = normalizeLines(oldBlock);
  const normalizedContent = normalizeLines(content);

  if (normalizedContent.includes(normalizedOld)) {
    const contentArr = content.split("\n");
    const oldArr = oldBlock.split("\n");
    const searchArr = oldArr.map((l) => l.trimEnd());

    for (let start = 0; start <= contentArr.length - searchArr.length; start++) {
      let match = true;
      for (let j = 0; j < searchArr.length; j++) {
        if (contentArr[start + j].trimEnd() !== searchArr[j]) { match = false; break; }
      }
      if (match) {
        const before = contentArr.slice(0, start);
        const after = contentArr.slice(start + searchArr.length);
        return { applied: true, content: [...before, ...newBlock.split("\n"), ...after].join("\n"), method: "whitespace" };
      }
    }
  }

  // Strategy 3: context-free match using only the changed lines
  if (oldLines && oldLines.length > 0) {
    const oldText = oldLines.join("\n");
    const newText = newLines.join("\n");

    if (oldText.trim() && content.includes(oldText)) {
      return { applied: true, content: content.replace(oldText, newText), method: "context-free" };
    }

    // context-free with whitespace tolerance
    const normalizedOldText = oldLines.map((l) => l.trimEnd()).join("\n");
    if (normalizedOldText.trim() && normalizedContent.includes(normalizedOldText)) {
      const contentArr = content.split("\n");
      const searchArr = oldLines.map((l) => l.trimEnd());

      for (let start = 0; start <= contentArr.length - searchArr.length; start++) {
        let match = true;
        for (let j = 0; j < searchArr.length; j++) {
          if (contentArr[start + j].trimEnd() !== searchArr[j]) { match = false; break; }
        }
        if (match) {
          const before = contentArr.slice(0, start);
          const after = contentArr.slice(start + searchArr.length);
          return { applied: true, content: [...before, ...newLines, ...after].join("\n"), method: "context-free" };
        }
      }
    }
  }

  return { applied: false, content, method: null };
}

// ── Main ──

console.log(`Build Claude Code — 课程源码同步\n`);

const sourceDir = findLessonDir(lessonId);
if (!sourceDir) {
  console.error(`找不到课程 ${lessonId} 的目录`);
  process.exit(1);
}

console.log(`源课程: ${sourceDir}`);
if (dryRun) console.log("模式: 预览（不修改文件）\n");
else console.log("模式: 实际修改\n");

// 1. Get git diff
const diffText = getGitDiff(sourceDir);
if (!diffText.trim()) {
  console.log("未检测到改动。请确认：");
  console.log(`  - 你已修改了 agents/${sourceDir}/src/ 下的文件`);
  console.log(`  - 改动尚未 commit（或使用 --committed 对比上一个 commit）`);
  process.exit(0);
}

// 2. Parse replacements
const replacements = parseDiffToReplacements(diffText);
if (replacements.length === 0) {
  console.log("未能解析出可传播的改动块。");
  process.exit(0);
}

console.log(`检测到 ${replacements.length} 个改动块：`);
for (const r of replacements) {
  const summary = r.oldLines.length > 0
    ? `-${r.oldLines.length} +${r.newLines.length} 行`
    : `+${r.newLines.length} 行（新增）`;
  console.log(`  ${r.filename}: ${summary}`);
}
console.log("");

// 3. Get subsequent lessons
const allDirs = getAllLessonDirs();
const subsequentDirs = allDirs.filter((d) => {
  const num = parseInt(d.match(/^s(\d+)/)[1], 10);
  return num > lessonNum;
});

if (subsequentDirs.length === 0) {
  console.log("没有后续课程需要同步。");
  process.exit(0);
}

// 4. Apply replacements
let totalApplied = 0;
let totalSkipped = 0;
let totalFilesModified = 0;

for (const targetDir of subsequentDirs) {
  const targetId = targetDir.match(/^(s\d+)/)[1];
  let dirModified = false;
  const appliedInDir = [];
  const skippedInDir = [];

  for (const rep of replacements) {
    const targetFile = join(AGENTS_DIR, targetDir, "src", rep.filename);
    if (!existsSync(targetFile)) {
      if (verbose) skippedInDir.push(`${rep.filename} — 文件不存在`);
      continue;
    }

    let content = readFileSync(targetFile, "utf-8");
    const { applied, content: newContent, method } = applyReplacement(
      content, rep.oldBlock, rep.newBlock, rep.oldLines, rep.newLines
    );

    if (applied) {
      if (!dryRun) {
        writeFileSync(targetFile, newContent, "utf-8");
      }
      const methodLabel = method === "context-free" ? " (无上下文匹配)" : "";
      appliedInDir.push(`${rep.filename}${methodLabel}`);
      totalApplied++;
      dirModified = true;
    } else {
      skippedInDir.push(`${rep.filename} — 未找到匹配文本（该课可能已重写此部分）`);
      totalSkipped++;
    }
  }

  if (dirModified) totalFilesModified++;

  if (appliedInDir.length > 0 || (verbose && skippedInDir.length > 0)) {
    const prefix = dryRun ? "[预览]" : "[已修改]";
    if (appliedInDir.length > 0) {
      console.log(`${prefix} ${targetId}: ${appliedInDir.join(", ")}`);
    }
    if (verbose) {
      for (const s of skippedInDir) {
        console.log(`  [跳过] ${targetId}: ${s}`);
      }
    }
  }
}

// 5. Summary
console.log("\n" + "─".repeat(50));
console.log(`${dryRun ? "预览" : "同步"}完成：`);
console.log(`  ✓ ${totalApplied} 个替换${dryRun ? "可应用" : "已应用"}，涉及 ${totalFilesModified} 个课程`);
if (totalSkipped > 0) {
  console.log(`  ⚠ ${totalSkipped} 个替换跳过（目标文件中未找到匹配）`);
  console.log(`    → 使用 --verbose 查看详情，跳过的可能需要手动修改`);
}

if (dryRun) {
  console.log(`\n确认无误后，去掉 --dry-run 重新运行以实际修改文件。`);
}

console.log(`\n建议：同步后运行校验确认一致性：`);
console.log(`  node scripts/check-consistency.mjs --from ${lessonId}`);
console.log(`  cd web && npm run build`);
