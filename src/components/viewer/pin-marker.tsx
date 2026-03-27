"use client";

import { useRef } from "react";
import { useReviewStore } from "@/lib/store";
import { PinPopover } from "./pin-popover";
import { CAT_META } from "@/lib/types";
import type { Pin } from "@/lib/types";

interface PinMarkerProps {
  pin: Pin;
  onClick: (pin: Pin) => void;
}

export function PinMarker({ pin, onClick }: PinMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const selectPin = useReviewStore((s) => s.selectPin);
  const isSelected = selectedPinId === pin.id;
  const meta = CAT_META[pin.category ?? "design"];

  return (
    <>
      <div
        className="absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-full cursor-pointer select-none"
        style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
        onClick={(e) => { e.stopPropagation(); onClick(pin); }}
      >
        <div
          ref={markerRef}
          className={`
            flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
            shadow-lg border-2 transition-all duration-150
            ${isSelected ? "scale-125 ring-2 ring-offset-1 ring-yellow-400/40" : "hover:scale-110"}
          `}
          style={{
            backgroundColor: isSelected ? "#facc15" : meta.hex,
            borderColor: isSelected ? "#fde68a" : meta.hex + "80",
            color: isSelected ? "#713f12" : "white",
          }}
          title={`Pin #${pin.id}: ${pin.label} [${meta.label}]`}
        >
          {pin.id}
        </div>
        <div className="w-0.5 h-2" style={{ backgroundColor: isSelected ? "#facc15" : meta.hex }} />
      </div>

      {isSelected && (
        <PinPopover pin={pin} anchorEl={markerRef.current} onClose={() => selectPin(null)} />
      )}
    </>
  );
}
