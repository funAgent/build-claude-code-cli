/**
 * 统一的课程 session JSON 动态加载器
 *
 * 利用 webpack 的 dynamic import expression 特性，
 * 一行代码替代各组件中 ~50 行的 s00-s48 显式 import map。
 *
 * webpack 会自动扫描 @/data/{folder}/ 目录中的所有 JSON 文件
 * 并生成按需加载的 chunk。
 */

const VERSION_RE = /^s\d{2}$/;

function assertVersion(version: string): void {
  if (!VERSION_RE.test(version)) {
    throw new Error(`Invalid version identifier: ${version}`);
  }
}

export function loadScenario<T>(version: string): Promise<T> {
  assertVersion(version);
  return import(`@/data/scenarios/${version}.json`).then((m) => m.default);
}

export function loadAnnotation<T>(version: string): Promise<T> {
  assertVersion(version);
  return import(`@/data/annotations/${version}.json`).then((m) => m.default);
}

export function loadRecording<T>(version: string): Promise<T> {
  assertVersion(version);
  return import(`@/data/terminal-recordings/${version}.json`).then((m) => m.default);
}
