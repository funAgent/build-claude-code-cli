"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type Placement = "top" | "bottom";

interface TooltipState {
  visible: boolean;
  text: string;
}

export function TermTip({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [mounted, setMounted] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    text: "",
  });
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<Placement>("bottom");

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltipEl = tooltipRef.current;
    if (!trigger || !tooltipEl) return;

    const tr = trigger.getBoundingClientRect();
    const tRect = tooltipEl.getBoundingClientRect();
    const GAP = 10;
    const PAD = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - tr.bottom;
    const spaceAbove = tr.top;
    const place: Placement =
      spaceBelow < tRect.height + GAP + PAD && spaceAbove > spaceBelow
        ? "top"
        : "bottom";

    const top =
      place === "bottom"
        ? tr.bottom + GAP
        : tr.top - GAP - tRect.height;

    let left = tr.left + (tr.width - tRect.width) / 2;
    left = Math.max(PAD, Math.min(left, vw - PAD - tRect.width));

    setCoords({ top, left });
    setPlacement(place);

    if (arrowRef.current) {
      const arrowCenter = tr.left + tr.width / 2 - left;
      arrowRef.current.style.left = `${arrowCenter - 4}px`;
      arrowRef.current.setAttribute("data-side", place);
    }
  }, []);

  const show = useCallback(
    (el: HTMLElement) => {
      const tip = el.getAttribute("data-tip");
      if (!tip) return;

      clearTimeout(hideTimerRef.current);
      triggerRef.current = el;

      const rect = el.getBoundingClientRect();
      setCoords({ top: rect.bottom + 10, left: rect.left });
      setPlacement("bottom");
      setTooltip({ visible: true, text: tip });

      requestAnimationFrame(() => updatePosition());
    },
    [updatePosition],
  );

  const hide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setTooltip({ visible: false, text: "" });
      triggerRef.current = null;
    }, 150);
  }, []);

  /* ---- event delegation ---- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("abbr[data-tip]");
      if (target) show(target as HTMLElement);
    };
    const onOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("abbr[data-tip]");
      if (target) hide();
    };

    container.addEventListener("mouseover", onOver);
    container.addEventListener("mouseout", onOut);
    return () => {
      container.removeEventListener("mouseover", onOver);
      container.removeEventListener("mouseout", onOut);
      clearTimeout(hideTimerRef.current);
    };
  }, [show, hide]);

  /* ---- reposition on scroll / resize ---- */
  useEffect(() => {
    if (!tooltip.visible) return;
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [tooltip.visible, updatePosition]);

  return (
    <>
      <div ref={containerRef}>{children}</div>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {tooltip.visible && (
              <motion.div
                ref={tooltipRef}
                className="term-tooltip"
                data-placement={placement}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                }}
                initial={{ opacity: 0, y: placement === "bottom" ? -4 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onMouseEnter={() => clearTimeout(hideTimerRef.current)}
                onMouseLeave={hide}
              >
                <div ref={arrowRef} className="term-tooltip-arrow" />
                <p>{tooltip.text}</p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
