"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Pin, ChatMessage } from "./types";

interface ReviewState {
  // Session-only (not persisted)
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
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  selectPin: (id: number | null) => void;
  setAnnotating: (v: boolean) => void;
  setZoom: (zoom: number) => void;
  clearAll: () => void;
  exportMarkdown: () => string;
  copyAllComments: () => string;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      // Session-only defaults
      htmlContent: null,
      blobUrl: null,
      fileName: null,
      selectedPinId: null,
      annotating: false,
      zoom: 1,

      // Persisted defaults
      pins: [],
      messages: [],
      nextPinId: 1,

      loadFile: (content, name, blobUrl) => {
        set({ htmlContent: content, blobUrl, fileName: name });
      },

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
        const { pins, messages } = get();
        set({
          pins: pins.filter((p) => p.id !== id),
          messages: messages.filter((m) => !(m.type === "pin" && m.pinId === id)),
          selectedPinId: get().selectedPinId === id ? null : get().selectedPinId,
        });
      },

      addMessage: (msg) => {
        const { messages } = get();
        const newMsg: ChatMessage = {
          ...msg,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
        };
        set({ messages: [...messages, newMsg] });
      },

      selectPin: (id) => set({ selectedPinId: id }),
      setAnnotating: (v) => set({ annotating: v }),
      setZoom: (zoom) => set({ zoom }),

      clearAll: () => {
        set({ pins: [], messages: [], nextPinId: 1, selectedPinId: null });
      },

      exportMarkdown: () => {
        const { pins, messages, fileName } = get();
        const lines: string[] = [
          `# Visual Review: ${fileName || "Untitled"}`,
          `*Generated: ${new Date().toLocaleString()}*`,
          "",
          `## Pins (${pins.length})`,
          "",
        ];

        for (const pin of pins) {
          lines.push(`### Pin #${pin.id} — ${pin.label}`);
          lines.push(`Position: ${pin.xPct.toFixed(1)}%, ${pin.yPct.toFixed(1)}%`);
          if (pin.screenshot) {
            lines.push(`![Pin ${pin.id} screenshot](${pin.screenshot})`);
          }
          lines.push("");
        }

        lines.push("## Comments", "");
        for (const msg of messages) {
          if (msg.type === "pin") {
            lines.push(`**${msg.content}**`);
            if (msg.screenshot) {
              lines.push(`![screenshot](${msg.screenshot})`);
            }
          } else {
            lines.push(`> ${msg.content}`);
          }
          lines.push("");
        }

        return lines.join("\n");
      },

      copyAllComments: () => {
        const { messages } = get();
        return messages
          .map((m) =>
            m.type === "pin" ? `[${m.content}]` : m.content
          )
          .join("\n");
      },
    }),
    {
      name: "visual-review-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Strip screenshots from persisted data — they're large base64 strings
        pins: state.pins.map((p) => ({ ...p, screenshot: null })),
        messages: state.messages.map((m) => ({ ...m, screenshot: undefined })),
        nextPinId: state.nextPinId,
        zoom: state.zoom,
      }),
    }
  )
);
