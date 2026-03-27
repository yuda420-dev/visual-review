"use client";

import { useCallback } from "react";
import { IframePanel } from "@/components/viewer/iframe-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useReviewStore } from "@/lib/store";
import type { Pin } from "@/lib/types";

export default function Home() {
  const selectPin = useReviewStore((s) => s.selectPin);

  const handlePinClick = useCallback(
    (pin: Pin) => {
      selectPin(pin.id);
    },
    [selectPin]
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* App header */}
      <header className="flex-none flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
        <span className="font-semibold text-sm tracking-tight">Visual Review</span>
        <span className="text-xs text-muted-foreground hidden sm:block">
          Open an HTML file, drop pins, leave comments
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/40">
          A — annotate · 1-9 — jump to pin · Esc — deselect
        </span>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Iframe panel (60%) */}
        <div className="w-[60%] flex-none border-r border-border overflow-hidden flex flex-col">
          <IframePanel />
        </div>

        {/* Right: Chat panel (40%) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ChatPanel onPinClick={handlePinClick} />
        </div>
      </div>
    </div>
  );
}
