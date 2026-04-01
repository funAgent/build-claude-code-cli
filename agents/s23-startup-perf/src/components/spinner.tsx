/**
 * s15 — Spinner 组件
 *
 * 在 Agent 执行期间显示旋转动画，给用户"正在工作"的反馈。
 * 用 useEffect + setInterval 实现帧动画。
 *
 * 对照 Claude Code: components/Spinner.tsx
 * 生产版的 Spinner 还包含 token 统计、预估时间、团队成员树
 * 教学版聚焦核心：帧动画 + 动态文本
 */

import React, { useState, useEffect } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({
  label = "thinking",
}: {
  label?: string;
}): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color="yellow">
      {FRAMES[frame]} {label}…
    </Text>
  );
}
