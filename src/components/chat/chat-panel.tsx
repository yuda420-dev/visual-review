"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useReviewStore } from "@/lib/store";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Pin } from "@/lib/types";
import { Copy, Download, Trash2, MessageSquare } from "lucide-react";

interface ChatPanelProps {
  onPinClick: (pin: Pin) => void;
}

export function ChatPanel({ onPinClick }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useReviewStore((s) => s.messages);
  const pins = useReviewStore((s) => s.pins);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const { addMessage, copyAllComments, exportMarkdown, clearAll } = useReviewStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input when a new pin is created (pin count increases)
  useEffect(() => {
    if (selectedPinId != null) {
      inputRef.current?.focus();
    }
  }, [selectedPinId]);

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage({ type: "user", content: trimmed });
    setInput("");
  }, [input, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleCopy = () => {
    const text = copyAllComments();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleExport = () => {
    const md = exportMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "visual-review.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePinRef = (pinId: number) => {
    const pin = pins.find((p) => p.id === pinId);
    if (pin) onPinClick(pin);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-none">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Review Chat</span>
        {messages.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
              title="Copy all comments"
            >
              {copied ? (
                <span className="text-[10px] text-green-400">✓</span>
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleExport}
              title="Export as Markdown"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Clear all pins and comments?")) clearAll();
              }}
              title="Clear all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-20" />
            <p className="text-sm text-center">
              Click a pin or enable annotation mode to start commenting
            </p>
          </div>
        ) : (
          <div className="py-3 flex flex-col gap-0.5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onPinRef={handlePinRef} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="flex-none border-t border-border bg-card p-3 flex flex-col gap-2">
        {selectedPinId != null && (
          <p className="text-xs text-muted-foreground">
            Commenting on Pin #{selectedPinId}
          </p>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedPinId != null
                ? `Comment on Pin #${selectedPinId}… (Enter to send)`
                : "Type a comment… (Enter to send)"
            }
            className="flex-1 min-h-[60px] max-h-32 resize-none text-sm bg-background"
            rows={2}
          />
          <Button
            onClick={send}
            disabled={!input.trim()}
            className="h-9 px-3 text-xs"
          >
            Send
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50">
          Shift+Enter for new line • Esc to deselect pin
        </p>
      </div>
    </div>
  );
}
