/**
 * 简单的行级 diff 算法（Myers O(ND) 简化版）
 * 返回统一 diff 格式的行标记
 */

export type DiffLineType = "same" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface FileDiff {
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  lines: DiffLine[];
  addCount: number;
  removeCount: number;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;
  const len: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        len[i][j] = len[i - 1][j - 1] + 1;
      } else {
        len[i][j] = Math.max(len[i - 1][j], len[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", content: oldLines[i - 1], oldLineNo: i, newLineNo: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || len[i][j - 1] >= len[i - 1][j])) {
      stack.push({ type: "add", content: newLines[j - 1], newLineNo: j });
      j--;
    } else {
      stack.push({ type: "remove", content: oldLines[i - 1], oldLineNo: i });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

export interface SourceFile {
  name: string;
  content: string;
}

export function computeFileDiffs(
  oldFiles: SourceFile[],
  newFiles: SourceFile[]
): FileDiff[] {
  const oldMap = new Map(oldFiles.map((f) => [f.name, f.content]));
  const newMap = new Map(newFiles.map((f) => [f.name, f.content]));

  const allNames = new Set([...oldMap.keys(), ...newMap.keys()]);
  const diffs: FileDiff[] = [];

  for (const name of allNames) {
    const oldContent = oldMap.get(name);
    const newContent = newMap.get(name);

    if (oldContent === undefined && newContent !== undefined) {
      const lines = newContent.split("\n").map((line, i): DiffLine => ({
        type: "add",
        content: line,
        newLineNo: i + 1,
      }));
      diffs.push({ name, status: "added", lines, addCount: lines.length, removeCount: 0 });
    } else if (oldContent !== undefined && newContent === undefined) {
      const lines = oldContent.split("\n").map((line, i): DiffLine => ({
        type: "remove",
        content: line,
        oldLineNo: i + 1,
      }));
      diffs.push({ name, status: "removed", lines, addCount: 0, removeCount: lines.length });
    } else if (oldContent !== undefined && newContent !== undefined) {
      if (oldContent === newContent) {
        diffs.push({ name, status: "unchanged", lines: [], addCount: 0, removeCount: 0 });
      } else {
        const lines = computeLineDiff(oldContent, newContent);
        const addCount = lines.filter((l) => l.type === "add").length;
        const removeCount = lines.filter((l) => l.type === "remove").length;
        diffs.push({ name, status: "modified", lines, addCount, removeCount });
      }
    }
  }

  return diffs.sort((a, b) => {
    const order = { added: 0, modified: 1, removed: 2, unchanged: 3 };
    return order[a.status] - order[b.status];
  });
}
