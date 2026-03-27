"use client";

import { useRef, useCallback, useEffect } from "react";
import { useReviewStore } from "@/lib/store";
import { PinMarker } from "./pin-marker";
import { PinList } from "./pin-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Pin } from "@/lib/types";
import { FolderOpen, Crosshair, ZoomIn, ZoomOut, Maximize } from "lucide-react";

async function captureScreenshot(
  iframe: HTMLIFrameElement,
  clickX: number,
  clickY: number
): Promise<string | null> {
  try {
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return null;
    const html2canvas = (await import("html2canvas")).default;
    const scrollX = iframe.contentWindow?.scrollX ?? 0;
    const scrollY = iframe.contentWindow?.scrollY ?? 0;
    const canvas = await html2canvas(iframeDoc.body, {
      useCORS: true,
      allowTaint: true,
      x: scrollX + clickX - 200,
      y: scrollY + clickY - 150,
      width: 400,
      height: 300,
      logging: false,
    });
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

function getLabelAtPoint(iframe: HTMLIFrameElement, x: number, y: number): string {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return "unknown area";
    const el = doc.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return "unknown area";
    const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40);
    if (text) return text;
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className
      ? `.${String(el.className).split(" ").filter(Boolean)[0] || ""}`
      : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  } catch {
    return "unknown area";
  }
}

export function IframePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const blobUrl = useReviewStore((s) => s.blobUrl);
  const fileName = useReviewStore((s) => s.fileName);
  const pins = useReviewStore((s) => s.pins);
  const zoom = useReviewStore((s) => s.zoom);
  const annotating = useReviewStore((s) => s.annotating);
  const selectedPinId = useReviewStore((s) => s.selectedPinId);

  const { loadFile, addPin, addMessage, selectPin, setAnnotating, setZoom } =
    useReviewStore();

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const blob = new Blob([content], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        loadFile(content, file.name, url);
      };
      reader.readAsText(file);
      // Reset input so same file can be reloaded
      e.target.value = "";
    },
    [loadFile]
  );

  const handleOverlayClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!annotating || !overlayRef.current || !iframeRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const xPct = (clickX / rect.width) * 100;
      const yPct = (clickY / rect.height) * 100;

      const iframe = iframeRef.current;
      const scrollTop = iframe.contentWindow?.scrollY ?? 0;
      const scrollLeft = iframe.contentWindow?.scrollX ?? 0;
      const label = getLabelAtPoint(iframe, clickX, clickY);

      const screenshot = await captureScreenshot(iframe, clickX, clickY);

      const pinId = addPin({ xPct, yPct, scrollTop, scrollLeft, label, screenshot });

      addMessage({
        type: "pin",
        pinId,
        content: `📍 Pin #${pinId} — ${label}`,
        screenshot,
      });

      selectPin(pinId);
    },
    [annotating, addPin, addMessage, selectPin]
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      selectPin(pin.id);
      // Scroll iframe to pin's original scroll position
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.scrollTo({
          top: pin.scrollTop,
          left: pin.scrollLeft,
          behavior: "smooth",
        });
      }
      // Scroll pin into view in container
      if (containerRef.current) {
        const pinY = (pin.yPct / 100) * containerRef.current.clientHeight;
        containerRef.current.scrollTo({ top: pinY - 150, behavior: "smooth" });
      }
    },
    [selectPin]
  );

  // Keyboard: Escape deselects, numbers jump to pins
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        selectPin(null);
        setAnnotating(false);
      }
      if (e.key === "a" || e.key === "A") {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          setAnnotating(!annotating);
        }
      }
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1) {
        const pin = pins.find((p) => p.id === num);
        if (pin) handlePinClick(pin);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [annotating, pins, handlePinClick, selectPin, setAnnotating]);

  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-none">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 text-xs h-7"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {fileName ? "Change File" : "Open HTML File"}
        </Button>

        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={fileName}>
            {fileName}
          </span>
        )}

        {blobUrl && (
          <>
            <div className="ml-auto flex items-center gap-1">
              {/* Zoom */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  const idx = ZOOM_STEPS.indexOf(zoom);
                  if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
                }}
                disabled={zoom <= ZOOM_STEPS[0]}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button
                className="text-xs text-muted-foreground w-10 text-center"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  const idx = ZOOM_STEPS.indexOf(zoom);
                  if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
                }}
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom(1)}
                title="Fit (100%)"
              >
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Annotate toggle */}
            <Button
              variant={annotating ? "default" : "outline"}
              size="sm"
              className={`gap-1.5 text-xs h-7 ${annotating ? "bg-red-500 hover:bg-red-600 border-red-500" : ""}`}
              onClick={() => setAnnotating(!annotating)}
              title="Toggle annotation mode (A)"
            >
              <Crosshair className="h-3.5 w-3.5" />
              {annotating ? "Annotating" : "Annotate"}
            </Button>

            {pins.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {pins.length} pin{pins.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Iframe area */}
      <div className="flex-1 overflow-auto bg-gray-950" ref={containerRef}>
        {!blobUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <FolderOpen className="h-12 w-12 opacity-30" />
            <p className="text-sm">Open an HTML file to start reviewing</p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              Choose File
            </Button>
          </div>
        ) : (
          <div
            className="relative h-full"
            style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
          >
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="w-full h-full border-none block"
              style={{ minHeight: 400 }}
              sandbox="allow-scripts allow-same-origin"
              title="Review target"
            />

            {/* Click overlay */}
            <div
              ref={overlayRef}
              className={`absolute inset-0 ${
                annotating
                  ? "cursor-crosshair bg-transparent"
                  : "pointer-events-none"
              }`}
              onClick={handleOverlayClick}
            >
              {/* Pin markers */}
              {pins.map((pin) => (
                <PinMarker key={pin.id} pin={pin} onClick={handlePinClick} />
              ))}
            </div>

            {/* Annotate mode banner */}
            {annotating && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none z-30">
                Click anywhere to drop a pin — Esc to exit
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pin list */}
      {pins.length > 0 && (
        <div className="flex-none border-t border-border bg-card px-3 py-2 max-h-36 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-1 font-medium">
            Pins — click to scroll there (keys 1-9)
          </p>
          <PinList onPinClick={handlePinClick} />
        </div>
      )}
    </div>
  );
}
