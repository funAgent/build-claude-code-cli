"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: { id: string; label: string }[];
  defaultTab?: string;
  children: (activeTab: string) => React.ReactNode;
  className?: string;
}

export function Tabs({ tabs, defaultTab, children, className }: TabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "");

  return (
    <div className={className}>
      <div
        className="-mx-4 flex overflow-x-auto border-b border-zinc-200 px-4 sm:mx-0 sm:px-0 dark:border-zinc-700"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
              active === tab.id
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4" role="tabpanel">{children(active)}</div>
    </div>
  );
}
