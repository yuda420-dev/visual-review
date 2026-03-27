"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CAT_META } from "@/lib/types";
import type { PinCategory } from "@/lib/types";

interface CategorySelectorProps {
  screenX: number;
  screenY: number;
  onSelect: (cat: PinCategory) => void;
  onCancel: () => void;
}

const CATS: PinCategory[] = ["bug", "design", "feature", "question"];
const W = 212;
const H = 52;

export function CategorySelector({ screenX, screenY, onSelect, onCancel }: CategorySelectorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    // Delay so the originating click doesn't immediately dismiss
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 60);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onCancel]);

  // Keep within viewport
  const left = Math.min(screenX + 14, window.innerWidth - W - 8);
  const top = Math.max(8, Math.min(screenY - H / 2, window.innerHeight - H - 8));

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] bg-card border border-border rounded-lg shadow-2xl px-3 py-2.5 flex items-center gap-2"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] text-muted-foreground mr-0.5 whitespace-nowrap">Pin as:</span>
      {CATS.map((cat) => {
        const m = CAT_META[cat];
        return (
          <button
            key={cat}
            title={m.label}
            onClick={() => onSelect(cat)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring border-2"
            style={{ backgroundColor: m.hex, borderColor: m.hex + "90" }}
          >
            {m.emoji}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
