export interface Pin {
  id: number;
  xPct: number; // % of iframe viewport width at click time
  yPct: number; // % of iframe viewport height at click time
  scrollTop: number; // iframe scrollY at click time
  scrollLeft: number; // iframe scrollX at click time
  label: string; // element description at click point
  screenshot: string | null; // base64 PNG thumbnail
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  type: "pin" | "user";
  pinId?: number;
  content: string;
  screenshot?: string | null;
  timestamp: number;
}
