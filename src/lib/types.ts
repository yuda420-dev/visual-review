export type PinCategory = "bug" | "design" | "feature" | "question";

export const CAT_META: Record<PinCategory, { label: string; emoji: string; hex: string; tailwind: string; text: string }> = {
  bug:      { label: "Bug",      emoji: "🔴", hex: "#ef4444", tailwind: "bg-red-500 border-red-300",    text: "text-white" },
  design:   { label: "Design",   emoji: "🟡", hex: "#eab308", tailwind: "bg-yellow-400 border-yellow-200", text: "text-yellow-900" },
  feature:  { label: "Feature",  emoji: "🟢", hex: "#22c55e", tailwind: "bg-green-500 border-green-300", text: "text-white" },
  question: { label: "Question", emoji: "🔵", hex: "#3b82f6", tailwind: "bg-blue-500 border-blue-300",   text: "text-white" },
};

export interface Pin {
  id: number;
  xPct: number;
  yPct: number;
  scrollTop: number;
  scrollLeft: number;
  label: string;
  screenshot: string | null;
  createdAt: number;
  category: PinCategory; // default "design" for legacy pins
}

export interface ChatMessage {
  id: string;
  type: "pin" | "user";
  pinId?: number;
  content: string;
  screenshot?: string | null;
  timestamp: number;
}
