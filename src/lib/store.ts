"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "./idb-storage";
import type { Pin, ChatMessage, PinCategory } from "./types";
import { CAT_META } from "./types";

interface ReviewState {
  // ── Session-only ─────────────────────────────────────────────────────────
  htmlContent: string | null;
  blobUrl: string | null;
  fileName: string | null;
  selectedPinId: number | null;
  annotating: boolean;
  zoom: number;
  compareMode: boolean;
  rightBlobUrl: string | null;
  rightFileName: string | null;

  // ── Persisted ─────────────────────────────────────────────────────────────
  pins: Pin[];
  messages: ChatMessage[];
  nextPinId: number;
  dirPath: string;       // last used local path
  htmlFile: string;      // last used html filename
  autoReload: boolean;
  categoryFilter: PinCategory[]; // empty = show all

  // ── Actions ───────────────────────────────────────────────────────────────
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
  setDirPath: (v: string) => void;
  setHtmlFile: (v: string) => void;
  setAutoReload: (v: boolean) => void;
  setCategoryFilter: (cats: PinCategory[]) => void;
  setCompareMode: (v: boolean) => void;
  loadRightFile: (blobUrl: string, fileName: string) => void;
  clearAll: () => void;

  // ── Derived / computed ────────────────────────────────────────────────────
  getPinComments: (pinId: number) => string[];
  visiblePins: () => Pin[];
  exportMarkdown: () => string;
  copyAllComments: () => string;
  buildClaudePrompt: (filePath: string) => string;
  buildCLIPrompt: () => string;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      // Session defaults
      htmlContent: null,
      blobUrl: null,
      fileName: null,
      selectedPinId: null,
      annotating: false,
      zoom: 1,
      compareMode: false,
      rightBlobUrl: null,
      rightFileName: null,

      // Persisted defaults
      pins: [],
      messages: [],
      nextPinId: 1,
      dirPath: "",
      htmlFile: "",
      autoReload: true,
      categoryFilter: [],

      // ── File loading ────────────────────────────────────────────────────
      loadFile: (content, name, blobUrl) =>
        set({ htmlContent: content, blobUrl, fileName: name }),

      clearFile: () => {
        const { blobUrl } = get();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        set({ htmlContent: null, blobUrl: null, fileName: null, selectedPinId: null });
      },

      // ── Pins ────────────────────────────────────────────────────────────
      addPin: (pin) => {
        const { pins, nextPinId } = get();
        const category = pin.category ?? "design";
        const newPin: Pin = { ...pin, category, id: nextPinId, createdAt: Date.now() };
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

      updatePinScreenshot: (id, screenshot) =>
        set((s) => ({ pins: s.pins.map((p) => (p.id === id ? { ...p, screenshot } : p)) })),

      // ── Messages ────────────────────────────────────────────────────────
      addMessage: (msg) => {
        const newMsg: ChatMessage = {
          ...msg,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
        };
        set((s) => ({ messages: [...s.messages, newMsg] }));
      },

      updateMessageScreenshot: (pinId, screenshot) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.type === "pin" && m.pinId === pinId ? { ...m, screenshot } : m
          ),
        })),

      // ── Simple setters ──────────────────────────────────────────────────
      selectPin: (id) => set({ selectedPinId: id }),
      setAnnotating: (v) => set({ annotating: v }),
      setZoom: (zoom) => set({ zoom }),
      setDirPath: (v) => set({ dirPath: v }),
      setHtmlFile: (v) => set({ htmlFile: v }),
      setAutoReload: (v) => set({ autoReload: v }),
      setCategoryFilter: (cats) => set({ categoryFilter: cats }),
      setCompareMode: (v) => set({ compareMode: v }),
      loadRightFile: (blobUrl, fileName) => set({ rightBlobUrl: blobUrl, rightFileName: fileName }),

      clearAll: () =>
        set({ pins: [], messages: [], nextPinId: 1, selectedPinId: null }),

      // ── Derived ─────────────────────────────────────────────────────────
      getPinComments: (pinId) => {
        const { messages } = get();
        const result: string[] = [];
        let capturing = false;
        for (const msg of messages) {
          if (msg.type === "pin") capturing = msg.pinId === pinId;
          else if (msg.type === "user" && capturing) result.push(msg.content);
        }
        return result;
      },

      visiblePins: () => {
        const { pins, categoryFilter } = get();
        if (!categoryFilter.length) return pins;
        return pins.filter((p) => categoryFilter.includes(p.category ?? "design"));
      },

      // ── Exports ─────────────────────────────────────────────────────────
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
          const cat = CAT_META[pin.category ?? "design"];
          lines.push(`### ${cat.emoji} Pin #${pin.id} — ${pin.label} [${cat.label}]`);
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

      copyAllComments: () =>
        get()
          .messages.map((m) => (m.type === "pin" ? `[${m.content}]` : m.content))
          .join("\n"),

      /** CLI-ready prompt grouped by category, for pasting directly into Claude Code */
      buildCLIPrompt: () => {
        const { pins, messages, fileName, dirPath, htmlFile } = get();
        const filePath = dirPath && htmlFile
          ? `${dirPath}/${htmlFile}`
          : fileName || "the file";

        // Group comments by pin
        const pinComments = new Map<number, string[]>();
        let cur: number | null = null;
        for (const msg of messages) {
          if (msg.type === "pin" && msg.pinId != null) { cur = msg.pinId; }
          else if (msg.type === "user" && cur != null) {
            if (!pinComments.has(cur)) pinComments.set(cur, []);
            pinComments.get(cur)!.push(msg.content);
          }
        }

        const catOrder: PinCategory[] = ["bug", "design", "feature", "question"];
        const lines = [
          `Visual review of: ${filePath}`,
          `Date: ${new Date().toLocaleDateString()}`,
          "",
        ];

        for (const cat of catOrder) {
          const catPins = pins.filter((p) => (p.category ?? "design") === cat);
          const meta = CAT_META[cat];
          lines.push(`=== ${meta.emoji} ${meta.label.toUpperCase()}S (${catPins.length}) ===`);
          if (catPins.length === 0) { lines.push(""); continue; }
          lines.push("");
          for (const pin of catPins) {
            lines.push(`[Pin #${pin.id}] "${pin.label}" — ${pin.xPct.toFixed(0)}%, ${pin.yPct.toFixed(0)}%`);
            const comments = pinComments.get(pin.id) ?? [];
            for (const c of comments) lines.push(`  → ${c}`);
            if (!comments.length) lines.push(`  → (no comment)`);
            lines.push("");
          }
        }

        lines.push("---");
        lines.push(`File: ${filePath}`);
        lines.push(`Paste into Claude Code and say: "Fix the issues described in this review"`);

        return lines.join("\n");
      },

      /** Detailed prompt for Claude Code API integration */
      buildClaudePrompt: (filePath) => {
        const { pins, messages, fileName } = get();
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
          `Reviewing: ${filePath || fileName || "the dashboard"}`,
          "",
          "Review annotations (numbered pins placed on the page):",
          "",
        ];
        for (const { pin, comments } of groups) {
          const cat = CAT_META[pin.category ?? "design"];
          lines.push(`${cat.emoji} Pin #${pin.id} [${cat.label}] — "${pin.label}"`);
          lines.push(`Position: ${pin.xPct.toFixed(1)}% left, ${pin.yPct.toFixed(1)}% top`);
          if (comments.length) { for (const c of comments) lines.push(`  - ${c}`); }
          else lines.push("  - (no comment)");
          lines.push("");
        }
        if (filePath) {
          lines.push("Task: Apply all changes directly to:", filePath, "Then summarize what changed.");
        } else {
          lines.push("Task: Suggest specific code changes for each annotation (diffs or find/replace).");
        }
        return lines.join("\n");
      },
    }),
    {
      name: "visual-review-v1",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        // Exclude screenshots and session-only fields
        pins: state.pins.map((p) => ({ ...p, screenshot: null })),
        messages: state.messages.map((m) => ({ ...m, screenshot: undefined })),
        nextPinId: state.nextPinId,
        zoom: state.zoom,
        dirPath: state.dirPath,
        htmlFile: state.htmlFile,
        autoReload: state.autoReload,
        categoryFilter: state.categoryFilter,
      }),
    }
  )
);
