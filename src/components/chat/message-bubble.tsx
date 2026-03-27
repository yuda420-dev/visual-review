"use client";

import { useState } from "react";
import type { ChatMessage, PinCategory } from "@/lib/types";
import { CAT_META } from "@/lib/types";
import { useReviewStore } from "@/lib/store";
import Image from "next/image";
import { MapPin } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  onPinRef?: (pinId: number) => void;
}

// ── AI item parsing ───────────────────────────────────────────────────────────

function detectCategory(text: string): PinCategory {
  const t = text.toLowerCase();
  if (/broken|error|bug|fail|crash|missing data|no data|empty|blank|doesn.t (show|work)|not show|undefined|null/.test(t)) return "bug";
  if (/styling|style|design|inconsist|color|font|layout|align|spacing|visual|ui|appearance|look/.test(t)) return "design";
  if (/add|implement|feature|suggest|improve|enhance|could|should|would|consider|missing (feature|functionality)/.test(t)) return "feature";
  return "question";
}

interface AiItem { num: number; text: string; category: PinCategory; }

function parseAiItems(content: string): AiItem[] {
  const items: AiItem[] = [];
  let cur: { num: number; lines: string[] } | null = null;

  for (const line of content.split("\n")) {
    const match = line.match(/^(\d+)[.)]\s+(.+)/);
    if (match) {
      if (cur) items.push({ num: cur.num, text: cur.lines.join(" ").trim(), category: detectCategory(cur.lines.join(" ")) });
      cur = { num: parseInt(match[1]), lines: [match[2]] };
    } else if (cur && line.trim()) {
      cur.lines.push(line.trim());
    }
  }
  if (cur) items.push({ num: cur.num, text: cur.lines.join(" ").trim(), category: detectCategory(cur.lines.join(" ")) });

  return items;
}

// ── AI scan item with Pin button ─────────────────────────────────────────────

function AiScanItem({ item }: { item: AiItem }) {
  const [pinned, setPinned] = useState(false);
  const setPendingAiPin = useReviewStore((s) => s.setPendingAiPin);
  const setAnnotating = useReviewStore((s) => s.setAnnotating);
  const meta = CAT_META[item.category];

  const handlePin = () => {
    setPendingAiPin({ category: item.category, comment: item.text });
    setAnnotating(true);
    setPinned(true);
  };

  return (
    <div className="flex items-start gap-2 py-0.5 group">
      <span className="text-[10px] text-muted-foreground/50 flex-none w-4 mt-0.5 text-right">{item.num}.</span>
      <p className="flex-1 text-xs text-foreground/80 leading-relaxed">{item.text}</p>
      <button
        onClick={handlePin}
        disabled={pinned}
        title={pinned ? "Pin placed — click on the iframe to position it" : `Pin as ${meta.label}`}
        className="flex-none flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all"
        style={
          pinned
            ? { borderColor: "transparent", color: "var(--muted-foreground)", opacity: 0.5 }
            : { borderColor: meta.hex + "60", color: meta.hex, backgroundColor: meta.hex + "15" }
        }
      >
        <MapPin className="h-2.5 w-2.5" />
        {pinned ? "↓ click" : "📌 Pin"}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessageBubble({ message, onPinRef }: MessageBubbleProps) {
  if (message.type === "ai") {
    const items = parseAiItems(message.content);
    const streaming = !message.content;

    return (
      <div className="flex flex-col gap-1 py-2 border-b border-border/30 last:border-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">🤖 AI Scan</span>
          {streaming && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Scanning dashboard…</span>
          )}
          {!streaming && items.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{items.length} issue{items.length !== 1 ? "s" : ""} — click 📌 Pin then click the page to place</span>
          )}
        </div>

        {/* Show raw text while streaming (before first numbered item appears) */}
        {!streaming && items.length === 0 && (
          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{message.content}</p>
        )}

        {/* Streaming preview: show raw content when no items parsed yet */}
        {streaming && (
          <div className="h-1 w-16 bg-violet-500/30 rounded animate-pulse" />
        )}

        {/* Parsed numbered items */}
        {items.map((item) => (
          <AiScanItem key={item.num} item={item} />
        ))}
      </div>
    );
  }

  if (message.type === "pin") {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <button
          className="flex items-start gap-2 text-left group"
          onClick={() => message.pinId != null && onPinRef?.(message.pinId)}
        >
          <span className="flex-none mt-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {message.pinId}
          </span>
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            {message.content}
          </span>
        </button>
        {message.screenshot && (
          <div className="ml-7 rounded overflow-hidden border border-border w-48 h-28 relative flex-none">
            <Image
              src={message.screenshot}
              alt={`Pin ${message.pinId} screenshot`}
              fill
              className="object-cover object-top"
              unoptimized
            />
          </div>
        )}
      </div>
    );
  }

  // "user" type
  return (
    <div className="flex justify-end py-1">
      <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed">
        {message.content}
      </div>
    </div>
  );
}
