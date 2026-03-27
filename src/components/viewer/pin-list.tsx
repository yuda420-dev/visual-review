"use client";

import { useReviewStore } from "@/lib/store";
import { CAT_META } from "@/lib/types";
import type { Pin, PinCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PinListProps {
  onPinClick: (pin: Pin) => void;
}

const CATS: PinCategory[] = ["bug", "design", "feature", "question"];

export function PinList({ onPinClick }: PinListProps) {
  const allPins = useReviewStore((s) => s.pins);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const categoryFilter = useReviewStore((s) => s.categoryFilter);
  const removePin = useReviewStore((s) => s.removePin);
  const setCategoryFilter = useReviewStore((s) => s.setCategoryFilter);
  const visiblePins = useReviewStore((s) => s.visiblePins());

  if (allPins.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        No pins yet — enable annotation mode and click the page
      </p>
    );
  }

  const toggleCat = (cat: PinCategory) =>
    setCategoryFilter(
      categoryFilter.includes(cat)
        ? categoryFilter.filter((c) => c !== cat)
        : [...categoryFilter, cat]
    );

  return (
    <div className="flex flex-col gap-1">
      {/* Category filter chips */}
      <div className="flex items-center gap-1 flex-wrap mb-0.5">
        {CATS.map((cat) => {
          const m = CAT_META[cat];
          const count = allPins.filter((p) => (p.category ?? "design") === cat).length;
          if (!count) return null;
          const active = categoryFilter.includes(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className="text-[10px] px-1.5 py-0.5 rounded-full border transition-opacity"
              style={
                active
                  ? { backgroundColor: m.hex, borderColor: m.hex, color: "white", opacity: 1 }
                  : { borderColor: m.hex, color: m.hex, opacity: 0.45 }
              }
            >
              {m.emoji} {count}
            </button>
          );
        })}
        {categoryFilter.length > 0 && (
          <button
            onClick={() => setCategoryFilter([])}
            className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>

      {visiblePins.map((pin) => {
        const meta = CAT_META[pin.category ?? "design"];
        return (
          <div
            key={pin.id}
            className={`
              flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
              hover:bg-muted/60 transition-colors group text-sm
              ${selectedPinId === pin.id ? "bg-muted ring-1 ring-yellow-500/50" : ""}
            `}
            onClick={() => onPinClick(pin)}
          >
            <div
              className="h-5 w-5 flex-none flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{ backgroundColor: meta.hex, color: "white" }}
            >
              {pin.id}
            </div>
            <span className="flex-1 truncate text-muted-foreground text-xs">{pin.label}</span>
            <span
              className="text-[9px] flex-none px-1 py-0.5 rounded"
              style={{ backgroundColor: meta.hex + "25", color: meta.hex }}
            >
              {meta.label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-none"
              onClick={(e) => { e.stopPropagation(); removePin(pin.id); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
