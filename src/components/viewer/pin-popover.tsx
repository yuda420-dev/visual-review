"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useReviewStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { X, Send } from "lucide-react";
import type { Pin } from "@/lib/types";

interface PinPopoverProps {
  pin: Pin;
  anchorEl: HTMLDivElement | null; // the pin marker DOM node
  onClose: () => void;
}

export function PinPopover({ pin, anchorEl, onClose }: PinPopoverProps) {
  const [input, setInput] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, above: true });
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const comments = useReviewStore((s) => s.getPinComments(pin.id));
  const addMessage = useReviewStore((s) => s.addMessage);

  // Position popover above (or below) the pin marker
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const vh = window.innerHeight;
    const above = rect.top > 220; // enough room above?
    setPos({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
      above,
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [anchorEl]);

  // Recalculate on scroll/resize
  useEffect(() => {
    const update = () => {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const above = rect.top > 220;
      setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left: rect.left + rect.width / 2, above });
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl]);

  // Close on Escape or outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [onClose, anchorEl]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage({ type: "user", content: trimmed });
    setInput("");
    inputRef.current?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: pos.left,
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? `${window.innerHeight - pos.top}px` : undefined,
        transform: "translateX(-50%)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-none">
          {pin.id}
        </span>
        <span className="text-xs font-medium truncate flex-1 text-foreground" title={pin.label}>
          {pin.label}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1.5 max-h-40 overflow-y-auto border-b border-border">
          {comments.map((c, i) => (
            <p key={i} className="text-xs text-foreground/80 leading-relaxed">
              {c}
            </p>
          ))}
        </div>
      )}

      {comments.length === 0 && (
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs text-muted-foreground/50 italic">No comments yet</p>
        </div>
      )}

      {/* Quick comment input */}
      <div className="flex items-center gap-1.5 px-2 py-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Add a comment…"
          className="flex-1 bg-background border border-input rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 flex-none"
          onClick={send}
          disabled={!input.trim()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>,
    document.body
  );
}
