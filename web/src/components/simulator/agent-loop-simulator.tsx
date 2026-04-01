"use client";

import { useRef, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslations } from "@/lib/i18n";
import { useSimulator } from "@/hooks/useSimulator";
import { SimulatorControls } from "./simulator-controls";
import { SimulatorMessage } from "./simulator-message";
import { TerminalPlayer } from "@/components/terminal/terminal-player";
import type { Scenario } from "@/types/agent-data";

const scenarioModules: Record<string, () => Promise<{ default: Scenario }>> = {
  s00: () => import("@/data/scenarios/s00.json") as Promise<{ default: Scenario }>,
  s01: () => import("@/data/scenarios/s01.json") as Promise<{ default: Scenario }>,
  s02: () => import("@/data/scenarios/s02.json") as Promise<{ default: Scenario }>,
  s03: () => import("@/data/scenarios/s03.json") as Promise<{ default: Scenario }>,
  s04: () => import("@/data/scenarios/s04.json") as Promise<{ default: Scenario }>,
  s05: () => import("@/data/scenarios/s05.json") as Promise<{ default: Scenario }>,
  s06: () => import("@/data/scenarios/s06.json") as Promise<{ default: Scenario }>,
  s07: () => import("@/data/scenarios/s07.json") as Promise<{ default: Scenario }>,
};

interface AgentLoopSimulatorProps {
  version: string;
}

export function AgentLoopSimulator({ version }: AgentLoopSimulatorProps) {
  const t = useTranslations("version");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loader = scenarioModules[version];
    if (loader) {
      loader().then((mod) => setScenario(mod.default));
    }
  }, [version]);

  const sim = useSimulator(scenario?.steps ?? []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [sim.visibleSteps.length]);

  if (!scenario) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">模拟器场景即将上线</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          {scenario.description}
        </p>

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
            <SimulatorControls
              isPlaying={sim.isPlaying}
              isComplete={sim.isComplete}
              currentIndex={sim.currentIndex}
              totalSteps={sim.totalSteps}
              speed={sim.speed}
              onPlay={sim.play}
              onPause={sim.pause}
              onStep={sim.stepForward}
              onReset={sim.reset}
              onSpeedChange={sim.setSpeed}
            />
          </div>

          <div
            ref={scrollRef}
            className="flex max-h-[500px] min-h-[200px] flex-col gap-3 overflow-y-auto p-4"
          >
            {sim.visibleSteps.length === 0 && (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-secondary)]">
                点击 Play 或 Step 开始模拟
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {sim.visibleSteps.map((step, i) => (
                <SimulatorMessage key={i} step={step} index={i} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          终端预览
        </h3>
        <TerminalPlayer version={version} />
      </div>
    </div>
  );
}
