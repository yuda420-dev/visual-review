"use client";

import { useRef } from "react";
import { useReviewStore } from "@/lib/store";
import { PinPopover } from "./pin-popover";
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

  return (
    <>
      {/* Pin marker — needle + circle */}
      <div
        className="absolute z-20 flex flex-col items-center -translate-x-1/2 -translate-y-full cursor-pointer select-none"
        style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(pin);
        }}
      >
        <div
          ref={markerRef}
          className={`
            flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
            shadow-lg border-2 transition-all duration-150
            ${isSelected
              ? "bg-yellow-400 border-yellow-200 text-yellow-900 scale-125 ring-2 ring-yellow-400/40 ring-offset-1"
              : "bg-red-500 border-red-300 text-white hover:scale-110"
            }
          `}
          title={`Pin #${pin.id}: ${pin.label}`}
        >
          {pin.id}
        </div>
        <div className={`w-0.5 h-2 ${isSelected ? "bg-yellow-400" : "bg-red-500"}`} />
      </div>

      {/* Popover — shown when pin is selected */}
      {isSelected && (
        <PinPopover
          pin={pin}
          anchorEl={markerRef.current}
          onClose={() => selectPin(null)}
        />
      )}
    </>
  );
}
