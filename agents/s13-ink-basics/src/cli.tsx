/**
 * s13 — CLI 入口（Ink 版）
 *
 * 关键变化：用 Ink 的 render() 替代 readline + console.log。
 * 一行代码把 React 组件渲染到终端——和 ReactDOM.render() 对等。
 *
 * 对照 Claude Code: ink.ts 的 render() + createRoot() 封装
 */

import React from "react";
import { render } from "ink";
import { App } from "./components/app.js";

render(React.createElement(App));
