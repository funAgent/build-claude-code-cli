"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import confetti from "canvas-confetti";

const MESSAGES = [
  "49 课全部完成！你已经从一个 while 循环走到了生产级 Agent CLI。这不只是学习，这是一次蜕变。🎓",
  "恭喜通关！你现在掌握的不只是代码，而是构建 AI Agent 的完整工程哲学。去创造属于你的 Agent 吧！🚀",
  "全部完成，了不起！从 API 基础到多 Agent 协作，你已经具备了独立构建 Agent 产品的能力。💪",
  "终点即新起点。49 课的积累让你站在了 Agent 工程的前沿，未来可期！🌟",
  "完美收官！回头看看你的学习轨迹，每一步都在为下一步铺路。现在，你已经准备好了。✨",
  "从零到一，从一到完整产品。你用行动证明了：最好的学习方式就是亲手构建。致敬你的坚持！🏆",
];

function createConfettiCanvas(): {
  fire: confetti.CreateTypes;
  cleanup: () => void;
} {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "10001",
    pointerEvents: "none",
  });
  document.body.appendChild(canvas);
  const fire = confetti.create(canvas, { resize: true });
  return { fire, cleanup: () => { fire.reset(); canvas.remove(); } };
}

function fireConfetti(fire: confetti.CreateTypes) {
  const duration = 4000;
  const end = Date.now() + duration;

  const frame = () => {
    fire({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"],
    });
    fire({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"],
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();

  setTimeout(() => {
    fire({
      particleCount: 150,
      spread: 100,
      origin: { x: 0.5, y: 0.4 },
      colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"],
    });
  }, 800);
}

interface CelebrationOverlayProps {
  onClose: () => void;
}

export function CelebrationOverlay({ onClose }: CelebrationOverlayProps) {
  const [message] = useState(
    () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
  );
  const [displayText, setDisplayText] = useState("");
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const confettiRef = useRef<{ cleanup: () => void } | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const { fire, cleanup } = createConfettiCanvas();
    confettiRef.current = { cleanup };
    fireConfetti(fire);
    return () => cleanup();
  }, []);

  useEffect(() => {
    let i = 0;
    const delay = setTimeout(() => {
      const timer = setInterval(() => {
        i++;
        setDisplayText(message.slice(0, i));
        if (i >= message.length) clearInterval(timer);
      }, 45);
      return () => clearInterval(timer);
    }, 600);
    return () => clearTimeout(delay);
  }, [message]);

  const handleClose = useCallback(() => {
    setFading(true);
    setTimeout(onClose, 400);
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(handleClose, 10000);
    return () => clearTimeout(timer);
  }, [handleClose]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-400 ${
        visible && !fading ? "opacity-100" : "opacity-0"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className={`relative mx-4 w-full max-w-lg transform transition-all duration-500 ${
          visible && !fading
            ? "translate-y-0 scale-100"
            : "translate-y-8 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-8 shadow-2xl sm:p-10">
          <div className="mb-6 text-center text-5xl sm:text-6xl">🎉</div>

          <h2 className="mb-2 text-center text-xl font-bold text-white sm:text-2xl">
            恭喜你，全部通关！
          </h2>
          <p className="mb-6 text-center text-sm text-zinc-400">
            49 / 49 课程已完成
          </p>

          <div className="min-h-[4.5rem] rounded-xl bg-white/5 px-5 py-4">
            <p className="text-sm leading-relaxed text-zinc-200">
              {displayText}
              <span className="ml-0.5 inline-block w-0.5 animate-pulse bg-emerald-400">
                &nbsp;
              </span>
            </p>
          </div>

          <button
            onClick={handleClose}
            className="mt-6 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            继续前行
          </button>
        </div>
      </div>
    </div>
  );
}
