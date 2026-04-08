<p align="center">
  <h1 align="center">Build Claude Code</h1>
  <p align="center">
    <strong>Build an Enterprise-Grade AI Agent CLI from Scratch — A Lesson-by-Lesson Deconstruction of Claude Code's Architecture</strong>
  </p>
  <p align="center">
    <a href="./README.md">中文</a> · <a href="./README_en.md">English</a>
  </p>
  <p align="center">
    🌐 <a href="https://build.funagent.app">Website</a> · 📖 <a href="./CONTRIBUTING.md">Contributing</a> · 🐛 <a href="https://github.com/funAgent/build-claude-code-cli/issues">Issues</a>
  </p>
</p>

<p align="center">
  <a href="https://github.com/funAgent/build-claude-code-cli/stargazers"><img src="https://img.shields.io/github/stars/funAgent/build-claude-code-cli?style=flat&color=FFD700" alt="GitHub Stars" /></a>
  <a href="https://github.com/funAgent/build-claude-code-cli/network/members"><img src="https://img.shields.io/github/forks/funAgent/build-claude-code-cli?style=flat" alt="GitHub Forks" /></a>
  <a href="https://github.com/funAgent/build-claude-code-cli/commits"><img src="https://img.shields.io/github/last-commit/funAgent/build-claude-code-cli" alt="Last Commit" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/lessons-49-brightgreen.svg" alt="49 Lessons" />
  <img src="https://img.shields.io/badge/TypeScript-100%25-3178C6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js-16-000.svg" alt="Next.js 16" />
</p>

---

## Disclaimer

This project is for **educational purposes only**. The content is based on publicly available technical analyses of Claude Code and inspired by the [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) project. All lesson code is independently written for teaching demonstration and is not intended for production use.

> "Claude Code" is a trademark of Anthropic. This project is not affiliated with or endorsed by Anthropic.

## What is this?

![Website Homepage](.github/screenshot.jpg)

49 progressive lessons that teach you to build a fully-featured AI Agent CLI — architecturally aligned with [Claude Code](https://github.com/anthropics/claude-code) — starting from `npm init`.

**The core pattern is just one while loop:**

```typescript
while (true) {
  response = await client.messages.create({ messages, tools })
  if (response.stop_reason !== "tool_use") break
  for (const toolCall of response.content) {
    result = await executeTool(toolCall.name, toolCall.input)
    messages.push(result)
  }
}
```

Each lesson produces a self-contained, runnable project snapshot. From the first API call to the final telemetry system, you'll end up with a complete, distributable AI Agent CLI.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/funAgent/build-claude-code-cli.git
cd build-claude-code-cli

# Run any lesson
cd agents/s03-agent-loop
npm install
cp .env.example .env   # then add your API key
npm run dev

# Launch the tutorial website
cd web
npm install
npm run dev
# Visit http://localhost:3000
```

**Prerequisites:** Node.js >= 18 · npm >= 9 · Git

## Curriculum

Start learning at [build.funagent.app](https://build.funagent.app/)

| # | Phase | Lessons | Key Capabilities |
|---|-------|---------|-----------------|
| 0 | Foundations | s00 – s02 | API calls, CLI scaffolding, child process management |
| 1 | Minimal Agent | s03 – s07 | Agent loop, message management, error handling, config, cost tracking |
| 2 | Tool System | s08 – s12 | Tool abstraction, file read/write, editing, search, tool registry |
| 3 | Terminal UI | s13 – s16 | Ink components, message list, input box, full REPL |
| 4 | Prompt Engineering | s17 – s19 | System prompts, CLAUDE.md rules, prompt caching |
| 5 | Streaming & Performance | s20 – s23 | Stream parsing, token streaming, parallel tools, startup optimization |
| 6 | Context Management | s24 – s26 | Conversation compaction, multi-layer strategies, large output handling |
| 7 | Agent Intelligence | s27 – s31 | Planning (TodoWrite), sub-agents, skill system, task management |
| 8 | Security & Permissions | s32 – s34 | Rule engine, permission UI, sub-agent permission inheritance |
| 9 | Extension Ecosystem | s35 – s38 | MCP protocol, session persistence, plugin system |
| 10 | Multi-Agent | s39 – s43 | Agent definitions, coordinator, team collaboration, communication protocols, worktree isolation |
| 11 | Production-Ready | s44 – s48 | Graceful recovery, feature flags, packaging & distribution, native capabilities, telemetry & diagnostics |

## Project Structure

```
build-claude-code-cli/
├── agents/              # 49 TypeScript lessons (each independently runnable)
│   ├── s00-api-basics/
│   ├── s01-cli-scaffold/
│   ├── ...
│   └── s48-telemetry-diagnostics/
├── docs/                # Tutorial documentation
│   ├── zh/              # 中文 (49 articles)
│   └── en/              # English
├── web/                 # Next.js tutorial website
│   └── src/
│       ├── app/         # Page routes
│       ├── components/  # UI components (source viewer, diff, terminal player, etc.)
│       ├── data/        # Scenarios, annotations, terminal recordings
│       └── lib/         # Utilities, constants, i18n
├── reference/           # Claude Code architecture reference notes
├── PLAN.md              # Detailed planning document
├── TODO.md              # Development progress tracking
└── CONTRIBUTING.md      # Contribution guide
```

## Tutorial Website Features

- **Interactive Source Viewer** — Syntax highlighting + lesson-by-lesson diff comparison
- **Terminal Recording Player** — Simulated real CLI interaction playback
- **Architecture Overview** — Visual module relationships and layered structure
- **Deep Annotations** — Architecture decisions mapped to Claude Code source code
- **Progress Tracking** — Locally persisted completion status
- **Bilingual Support** — Full Chinese/English toggle
- **Dark Mode** — Automatically follows system preference

## Tech Stack

**Lesson Projects:** TypeScript · Node.js · Commander.js · React + Ink · Anthropic SDK · Zod · esbuild · MCP SDK

**Tutorial Website:** Next.js 16 · React 19 · Tailwind CSS v4 · Framer Motion · unified (Markdown rendering)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) to learn how to:

- Improve existing lesson content
- Add new knowledge and materials
- Ensure consistency across lessons

## Contributors

<a href="https://github.com/funAgent/build-claude-code-cli/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=funAgent/build-claude-code-cli" />
</a>

## Star History

<a href="https://star-history.com/#funAgent/build-claude-code-cli&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=funAgent/build-claude-code-cli&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=funAgent/build-claude-code-cli&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=funAgent/build-claude-code-cli&type=Date" />
 </picture>
</a>

## License

[MIT](./LICENSE) © [funAgent](https://github.com/funAgent)
