"use client";

import { useReviewStore } from "@/lib/store";
import type { Pin } from "@/lib/types";

interface PinMarkerProps {
  pin: Pin;
  onClick: (pin: Pin) => void;
}

export function PinMarker({ pin, onClick }: PinMarkerProps) {
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const isSelected = selectedPinId === pin.id;

  return (
    <div
      className="absolute z-20 -translate-x-1/2 -translate-y-full cursor-pointer select-none group"
      style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(pin);
      }}
      title={`Pin #${pin.id}: ${pin.label}`}
    >
      <div
        className={`
          flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
          shadow-lg border-2 transition-all duration-150
          ${isSelected
            ? "bg-yellow-400 border-yellow-200 text-yellow-900 scale-125"
            : "bg-red-500 border-red-300 text-white hover:scale-110"
          }
        `}
      >
        {pin.id}
      </div>
      {/* Needle */}
      <div
        className={`w-0.5 h-2 mx-auto ${isSelected ? "bg-yellow-400" : "bg-red-500"}`}
      />
      {/* Tooltip on hover */}
      <div className="
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        hidden group-hover:block pointer-events-none
        bg-gray-900 text-gray-100 text-xs rounded px-2 py-1 whitespace-nowrap shadow-xl border border-gray-700
      ">
        #{pin.id} {pin.label}
      </div>
    </div>
  );
}
