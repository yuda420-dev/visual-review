"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Pin, ChatMessage } from "./types";

interface ReviewState {
  // Session-only
  htmlContent: string | null;
  blobUrl: string | null;
  fileName: string | null;
  selectedPinId: number | null;
  annotating: boolean;
  zoom: number;

  // Persisted
  pins: Pin[];
  messages: ChatMessage[];
  nextPinId: number;

  // Actions
  loadFile: (content: string, name: string, blobUrl: string) => void;
  clearFile: () => void;
  addPin: (pin: Omit<Pin, "id" | "createdAt">) => number;
  removePin: (id: number) => void;
  updatePinScreenshot: (id: number, screenshot: string) => void;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessageScreenshot: (pinId: number, screenshot: string) => void;
  selectPin: (id: number | null) => void;
  setAnnotating: (v: boolean) => void;
  setZoom: (zoom: number) => void;
  clearAll: () => void;
  exportMarkdown: () => string;
  copyAllComments: () => string;
  buildClaudePrompt: (filePath: string) => string;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      htmlContent: null,
      blobUrl: null,
      fileName: null,
      selectedPinId: null,
      annotating: false,
      zoom: 1,
      pins: [],
      messages: [],
      nextPinId: 1,

      loadFile: (content, name, blobUrl) =>
        set({ htmlContent: content, blobUrl, fileName: name }),

      clearFile: () => {
        const { blobUrl } = get();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        set({ htmlContent: null, blobUrl: null, fileName: null, selectedPinId: null });
      },

      addPin: (pin) => {
        const { pins, nextPinId } = get();
        const newPin: Pin = { ...pin, id: nextPinId, createdAt: Date.now() };
        set({ pins: [...pins, newPin], nextPinId: nextPinId + 1 });
        return nextPinId;
      },

      removePin: (id) => {
        const { pins, messages, selectedPinId } = get();
        set({
          pins: pins.filter((p) => p.id !== id),
          messages: messages.filter((m) => !(m.type === "pin" && m.pinId === id)),
          selectedPinId: selectedPinId === id ? null : selectedPinId,
        });
      },

      updatePinScreenshot: (id, screenshot) => {
        set((s) => ({
          pins: s.pins.map((p) => (p.id === id ? { ...p, screenshot } : p)),
        }));
      },

      addMessage: (msg) => {
        const newMsg: ChatMessage = {
          ...msg,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
        };
        set((s) => ({ messages: [...s.messages, newMsg] }));
      },

      updateMessageScreenshot: (pinId, screenshot) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.type === "pin" && m.pinId === pinId ? { ...m, screenshot } : m
          ),
        }));
      },

      selectPin: (id) => set({ selectedPinId: id }),
      setAnnotating: (v) => set({ annotating: v }),
      setZoom: (zoom) => set({ zoom }),

      clearAll: () =>
        set({ pins: [], messages: [], nextPinId: 1, selectedPinId: null }),

      exportMarkdown: () => {
        const { pins, messages, fileName } = get();
        const lines = [
          `# Visual Review: ${fileName || "Untitled"}`,
          `*Generated: ${new Date().toLocaleString()}*`,
          "",
          `## Pins (${pins.length})`,
          "",
        ];
        for (const pin of pins) {
          lines.push(`### Pin #${pin.id} — ${pin.label}`);
          lines.push(`Position: ${pin.xPct.toFixed(1)}%, ${pin.yPct.toFixed(1)}%`);
          if (pin.screenshot) lines.push(`![Pin ${pin.id}](${pin.screenshot})`);
          lines.push("");
        }
        lines.push("## Comments", "");
        for (const msg of messages) {
          if (msg.type === "pin") {
            lines.push(`**${msg.content}**`);
            if (msg.screenshot) lines.push(`![screenshot](${msg.screenshot})`);
          } else {
            lines.push(`> ${msg.content}`);
          }
          lines.push("");
        }
        return lines.join("\n");
      },

      copyAllComments: () => {
        return get()
          .messages.map((m) => (m.type === "pin" ? `[${m.content}]` : m.content))
          .join("\n");
      },

      buildClaudePrompt: (filePath) => {
        const { pins, messages, fileName } = get();

        // Group user messages under their nearest preceding pin-ref message
        const groups: { pin: Pin; comments: string[] }[] = [];
        let currentPinId: number | null = null;

        for (const msg of messages) {
          if (msg.type === "pin" && msg.pinId != null) {
            currentPinId = msg.pinId;
            const pin = pins.find((p) => p.id === msg.pinId);
            if (pin) groups.push({ pin, comments: [] });
          } else if (msg.type === "user" && currentPinId != null) {
            const g = groups.find((g) => g.pin.id === currentPinId);
            if (g) g.comments.push(msg.content);
          }
        }

        const lines = [
          `You are reviewing the file: ${filePath || fileName || "the dashboard"}`,
          "",
          "A designer/developer has placed visual annotation pins on the page and left feedback.",
          "Each pin has a position (as % of viewport) and a label describing what element was clicked.",
          "",
          "## Review Annotations",
          "",
        ];

        for (const { pin, comments } of groups) {
          lines.push(`### Pin #${pin.id} — "${pin.label}"`);
          lines.push(`Position: ${pin.xPct.toFixed(1)}% from left, ${pin.yPct.toFixed(1)}% from top`);
          if (comments.length > 0) {
            lines.push("Feedback:");
            for (const c of comments) lines.push(`  - ${c}`);
          } else {
            lines.push("(no comment left — review this area generally)");
          }
          lines.push("");
        }

        if (filePath) {
          lines.push(
            "## Task",
            `Please make all the changes described above directly to the file at: ${filePath}`,
            "After editing, summarize what you changed for each pin."
          );
        } else {
          lines.push(
            "## Task",
            "Please suggest specific code changes for each annotation above.",
            "Show the find/replace or diff for each change."
          );
        }

        return lines.join("\n");
      },
    }),
    {
      name: "visual-review-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pins: state.pins.map((p) => ({ ...p, screenshot: null })),
        messages: state.messages.map((m) => ({ ...m, screenshot: undefined })),
        nextPinId: state.nextPinId,
        zoom: state.zoom,
      }),
    }
  )
);
