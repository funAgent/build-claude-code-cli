import * as fs from "fs";
import * as path from "path";

const WEB_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_DIR, "..");
const AGENTS_DIR = path.join(REPO_ROOT, "agents");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const OUT_DIR = path.join(WEB_DIR, "src", "data", "generated");

interface SourceFile {
  name: string;
  content: string;
}

interface AgentVersion {
  id: string;
  loc: number;
  sourceFiles: SourceFile[];
}

interface DocContent {
  version: string;
  locale: string;
  title: string;
  content: string;
}

function countLoc(content: string): number {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("//");
    }).length;
}

function extractVersionId(dirname: string): string | null {
  const match = dirname.match(/^(s\d+)-/);
  return match ? match[1] : null;
}

function extractDocVersion(filename: string): string | null {
  const match = filename.match(/^(s\d+)-/);
  return match ? match[1] : null;
}

function main() {
  console.log("Extracting content...");
  console.log(`  Repo root: ${REPO_ROOT}`);

  if (!fs.existsSync(AGENTS_DIR)) {
    console.log("  Agents directory not found, skipping extraction.");
    return;
  }

  // 1. Read agent source files
  const agentDirs = fs
    .readdirSync(AGENTS_DIR)
    .filter((d) => d.startsWith("s") && fs.statSync(path.join(AGENTS_DIR, d)).isDirectory());

  console.log(`  Found ${agentDirs.length} agent directories`);

  const versions: AgentVersion[] = [];

  for (const dirname of agentDirs) {
    const versionId = extractVersionId(dirname);
    if (!versionId) continue;

    const srcDir = path.join(AGENTS_DIR, dirname, "src");
    if (!fs.existsSync(srcDir)) continue;

    const sourceFiles: SourceFile[] = [];
    let totalLoc = 0;

    function scanDir(dir: string, prefix: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const displayName = prefix ? `${prefix}/${entry.name}` : entry.name;
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          sourceFiles.push({ name: displayName, content });
          totalLoc += countLoc(content);
        }
      }
    }

    scanDir(srcDir, "");

    versions.push({ id: versionId, loc: totalLoc, sourceFiles });
  }

  versions.sort((a, b) => {
    const numA = parseInt(a.id.replace("s", ""), 10);
    const numB = parseInt(b.id.replace("s", ""), 10);
    return numA - numB;
  });

  // 2. Read doc files
  const docs: DocContent[] = [];

  if (fs.existsSync(DOCS_DIR)) {
    for (const locale of ["zh", "en"]) {
      const localeDir = path.join(DOCS_DIR, locale);
      if (!fs.existsSync(localeDir)) continue;

      const docFiles = fs.readdirSync(localeDir).filter((f) => f.endsWith(".md"));

      for (const filename of docFiles) {
        const version = extractDocVersion(filename);
        if (!version) continue;

        const content = fs.readFileSync(path.join(localeDir, filename), "utf-8");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : filename;

        docs.push({ version, locale, title, content });
      }
    }
    console.log(`  Found ${docs.length} doc files`);
  }

  // 3. Write output
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const versionsPath = path.join(OUT_DIR, "versions.json");
  fs.writeFileSync(versionsPath, JSON.stringify({ versions }, null, 2));
  console.log(`  Wrote ${versionsPath}`);

  const docsPath = path.join(OUT_DIR, "docs.json");
  fs.writeFileSync(docsPath, JSON.stringify(docs, null, 2));
  console.log(`  Wrote ${docsPath}`);

  console.log("\nExtraction complete:");
  console.log(`  ${versions.length} versions`);
  console.log(`  ${docs.length} docs`);
  for (const v of versions) {
    console.log(`    ${v.id}: ${v.loc} LOC, ${v.sourceFiles.length} files`);
  }
}

main();
