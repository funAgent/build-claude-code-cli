"use client";

import { useState, useEffect, useCallback } from "react";
import { VERSION_ORDER } from "@/lib/constants";

const STORAGE_KEY = "build-claude-code-progress";

function readProgress(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeProgress(set: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

// Custom event so same-tab components sync instantly
function dispatchChange() {
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

export function useProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCompleted(readProgress());

    // Listen for changes from other hook instances (same tab via custom
    // dispatch, or cross-tab via the native storage event).
    function sync() {
      setCompleted(readProgress());
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const toggle = useCallback((sessionId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      writeProgress(next);
      return next;
    });
    // Notify other useProgress instances
    dispatchChange();
  }, []);

  const isCompleted = useCallback(
    (sessionId: string) => completed.has(sessionId),
    [completed]
  );

  const completedCount = completed.size;
  const totalCount = VERSION_ORDER.length;

  const nextSession = VERSION_ORDER.find((v) => !completed.has(v)) ?? null;

  return { completed, toggle, isCompleted, completedCount, totalCount, nextSession };
}
