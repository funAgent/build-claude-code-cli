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

export function useProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCompleted(readProgress());
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
