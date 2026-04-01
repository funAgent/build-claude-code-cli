/**
 * s16 — CLI 入口（REPL Screen 版）
 *
 * 用 Ink 渲染完整的 REPL 屏幕。
 * 对照 Claude Code: main.tsx → render(REPL)
 */

import React from "react";
import { render } from "ink";
import { ReplScreen } from "./components/repl-screen.js";

render(React.createElement(ReplScreen));
