"use client";

import { useReviewStore } from "@/lib/store";
import type { Pin } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PinListProps {
  onPinClick: (pin: Pin) => void;
}

export function PinList({ onPinClick }: PinListProps) {
  const pins = useReviewStore((s) => s.pins);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const removePin = useReviewStore((s) => s.removePin);

  if (pins.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        No pins yet — enable annotation mode and click the page
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {pins.map((pin) => (
        <div
          key={pin.id}
          className={`
            flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
            hover:bg-muted/60 transition-colors group text-sm
            ${selectedPinId === pin.id ? "bg-muted ring-1 ring-yellow-500/50" : ""}
          `}
          onClick={() => onPinClick(pin)}
        >
          <Badge
            variant={selectedPinId === pin.id ? "default" : "secondary"}
            className={`h-5 w-5 flex-none flex items-center justify-center p-0 text-xs ${
              selectedPinId === pin.id ? "bg-yellow-400 text-yellow-900" : "bg-red-500/80 text-white"
            }`}
          >
            {pin.id}
          </Badge>
          <span className="flex-1 truncate text-muted-foreground text-xs">{pin.label}</span>
          <span className="text-xs text-muted-foreground/50 flex-none">
            {pin.xPct.toFixed(0)}%,{pin.yPct.toFixed(0)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-none"
            onClick={(e) => {
              e.stopPropagation();
              removePin(pin.id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
