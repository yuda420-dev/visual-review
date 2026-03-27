"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useReviewStore } from "@/lib/store";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Pin } from "@/lib/types";
import { Copy, Download, Trash2, Sparkles, X, ChevronUp, ChevronDown } from "lucide-react";

interface ChatPanelProps {
  onPinClick: (pin: Pin) => void;
}

export function ChatPanel({ onPinClick }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Claude Code panel state
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [allowEdit, setAllowEdit] = useState(false);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeResponse, setClaudeResponse] = useState("");
  const [claudeError, setClaudeError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const claudeScrollRef = useRef<HTMLDivElement>(null);

  const messages = useReviewStore((s) => s.messages);
  const pins = useReviewStore((s) => s.pins);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);
  const { addMessage, copyAllComments, exportMarkdown, clearAll, buildClaudePrompt } =
    useReviewStore();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedPinId != null) inputRef.current?.focus();
  }, [selectedPinId]);

  // Auto-scroll Claude response to bottom
  useEffect(() => {
    if (claudeScrollRef.current) {
      claudeScrollRef.current.scrollTop = claudeScrollRef.current.scrollHeight;
    }
  }, [claudeResponse]);

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
    navigator.clipboard.writeText(copyAllComments()).then(() => {
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

  const handleSendToClaude = async () => {
    if (pins.length === 0) return;
    setClaudeLoading(true);
    setClaudeResponse("");
    setClaudeError("");

    const prompt = buildClaudePrompt(filePath.trim());

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, allowEdit }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        setClaudeError(text || "Request failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          setClaudeResponse((prev) => prev + decoder.decode(value, { stream: !d }));
        }
      }
    } catch (err) {
      setClaudeError(String(err));
    } finally {
      setClaudeLoading(false);
    }
  };

  const hasContent = messages.length > 0 || pins.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Slim header — title only */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-none">
        <span className="text-sm font-medium">Review Chat</span>
        {pins.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {pins.length} pin{pins.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <p className="text-xs text-center">
              Enable annotation mode (A) and click the page to drop pins
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

      {/* Claude Code panel — slides up above the input */}
      {claudeOpen && (
        <div className="flex-none border-t border-border bg-card flex flex-col max-h-[45%]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-xs font-medium text-violet-300 flex-1">Send to Claude Code</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setClaudeOpen(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* File path row */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/path/to/dashboard_v7.html  (leave blank for suggestions only)"
              className="flex-1 bg-background border border-input rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer flex-none">
              <input
                type="checkbox"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
                className="rounded"
              />
              Edit file
            </label>
            <Button
              size="sm"
              className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white flex-none"
              onClick={handleSendToClaude}
              disabled={claudeLoading || pins.length === 0}
            >
              {claudeLoading ? "Running…" : "Run"}
            </Button>
          </div>

          {/* Streaming response */}
          <div
            ref={claudeScrollRef}
            className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
          >
            {claudeError && (
              <p className="text-xs text-destructive whitespace-pre-wrap">{claudeError}</p>
            )}
            {claudeResponse ? (
              <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed">
                {claudeResponse}
              </pre>
            ) : !claudeLoading ? (
              <p className="text-xs text-muted-foreground/50">
                {pins.length === 0
                  ? "Drop some pins first"
                  : `${pins.length} pin${pins.length !== 1 ? "s" : ""} ready — press Run to send to your local Claude Code`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground animate-pulse">Claude is thinking…</p>
            )}
          </div>
        </div>
      )}

      {/* Action bar — ALWAYS visible above input */}
      <div className="flex-none border-t border-border bg-card px-3 pt-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-xs ${claudeOpen ? "text-violet-400" : ""}`}
          onClick={() => setClaudeOpen((v) => !v)}
          title="Send to Claude Code"
          disabled={pins.length === 0}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Claude
          {claudeOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </Button>

        <div className="flex-1" />

        {hasContent && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy all comments">
              {copied ? <span className="text-[10px] text-green-400">✓</span> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export as Markdown">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive/60 hover:text-destructive"
              onClick={() => { if (confirm("Clear all pins and comments?")) clearAll(); }}
              title="Clear all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Chat input */}
      <div className="flex-none bg-card px-3 pb-3 pt-1.5 flex flex-col gap-1.5">
        {selectedPinId != null && (
          <p className="text-xs text-muted-foreground">Commenting on Pin #{selectedPinId}</p>
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
            className="flex-1 min-h-[56px] max-h-28 resize-none text-sm bg-background"
            rows={2}
          />
          <Button onClick={send} disabled={!input.trim()} className="h-9 px-3 text-xs">
            Send
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40">
          Shift+Enter for new line · Esc deselects pin
        </p>
      </div>
    </div>
  );
}
