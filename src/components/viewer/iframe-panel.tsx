"use client";

import { useRef, useCallback, useEffect } from "react";
import { useReviewStore } from "@/lib/store";
import { PinMarker } from "./pin-marker";
import { PinList } from "./pin-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Pin } from "@/lib/types";
import { FolderOpen, Crosshair, ZoomIn, ZoomOut, Maximize, Folder } from "lucide-react";

// ── Screenshot helper ──────────────────────────────────────────────────────────

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

// ── Label helper ──────────────────────────────────────────────────────────────

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

// ── Folder loading helpers ────────────────────────────────────────────────────

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "application/javascript",
    mjs: "application/javascript",
    css: "text/css",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    json: "application/json",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Rewrites relative src/href in HTML to blob URLs from the fileMap.
 * Leaves absolute URLs (http/https/data/blob//) untouched.
 */
function rewriteRelativeUrls(html: string, fileMap: Map<string, string>): string {
  return html.replace(/(\bsrc="|href=")([^"]+)(")/g, (match, pre, path, post) => {
    if (/^(https?:|\/\/|data:|blob:|#|\/)/.test(path)) return match;
    // Try exact match first, then basename only
    const blobUrl = fileMap.get(path) ?? fileMap.get(path.split("/").pop() ?? "");
    return blobUrl ? `${pre}${blobUrl}${post}` : match;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IframePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track dependency blob URLs so we can revoke them on reload
  const depBlobsRef = useRef<string[]>([]);

  const blobUrl = useReviewStore((s) => s.blobUrl);
  const fileName = useReviewStore((s) => s.fileName);
  const pins = useReviewStore((s) => s.pins);
  const zoom = useReviewStore((s) => s.zoom);
  const annotating = useReviewStore((s) => s.annotating);

  const { loadFile, addPin, addMessage, selectPin, setAnnotating, setZoom } =
    useReviewStore();

  // Revoke old dependency blobs before loading a new file
  const revokeDepBlobs = useCallback(() => {
    for (const url of depBlobsRef.current) URL.revokeObjectURL(url);
    depBlobsRef.current = [];
  }, []);

  // ── Single file picker ────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      revokeDepBlobs();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const blob = new Blob([content], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        loadFile(content, file.name, url);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [loadFile, revokeDepBlobs]
  );

  // ── Folder picker ─────────────────────────────────────────────────────────
  // Reads the entire folder, rewrites relative script/link/img src to blob URLs
  // so that local JS files (like plotly-2.27.0.min.js) actually load.

  const handleFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      e.target.value = "";

      // Find the HTML file (prefer shallowest path depth, then first alphabetically)
      const htmlFiles = files.filter((f) =>
        /\.(html|htm)$/i.test(f.name)
      );
      if (!htmlFiles.length) {
        alert("No .html file found in the selected folder.");
        return;
      }
      const htmlFile = htmlFiles.sort((a, b) => {
        const depthA = (a.webkitRelativePath || a.name).split("/").length;
        const depthB = (b.webkitRelativePath || b.name).split("/").length;
        return depthA - depthB || a.name.localeCompare(b.name);
      })[0];

      revokeDepBlobs();

      // Build blob URL map for every non-HTML file
      const fileMap = new Map<string, string>();
      await Promise.all(
        files
          .filter((f) => f !== htmlFile)
          .map(async (f) => {
            const buf = await f.arrayBuffer();
            const blob = new Blob([buf], { type: getMimeType(f.name) });
            const url = URL.createObjectURL(blob);
            depBlobsRef.current.push(url);
            // Register by filename and by relative path (minus the top-level folder)
            fileMap.set(f.name, url);
            const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/");
            if (rel) fileMap.set(rel, url);
          })
      );

      // Read HTML, rewrite relative refs, create final blob URL
      const rawHtml = await htmlFile.text();
      const rewrittenHtml = rewriteRelativeUrls(rawHtml, fileMap);
      const htmlBlob = new Blob([rewrittenHtml], { type: "text/html" });
      const htmlUrl = URL.createObjectURL(htmlBlob);

      loadFile(rawHtml, htmlFile.name, htmlUrl);
    },
    [loadFile, revokeDepBlobs]
  );

  // ── Annotation ────────────────────────────────────────────────────────────

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
      addMessage({ type: "pin", pinId, content: `📍 Pin #${pinId} — ${label}`, screenshot });
      selectPin(pinId);
    },
    [annotating, addPin, addMessage, selectPin]
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      selectPin(pin.id);
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.scrollTo({ top: pin.scrollTop, left: pin.scrollLeft, behavior: "smooth" });
      }
      if (containerRef.current) {
        const pinY = (pin.yPct / 100) * containerRef.current.clientHeight;
        containerRef.current.scrollTo({ top: pinY - 150, behavior: "smooth" });
      }
    },
    [selectPin]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") { selectPin(null); setAnnotating(false); }
      if (e.key === "a" || e.key === "A") setAnnotating(!annotating);
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
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card flex-none flex-wrap">
        {/* Single file */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 text-xs h-7"
          title="Open a single .html file (scripts that load local JS files may not work)"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {fileName ? "Change File" : "Open HTML File"}
        </Button>

        {/* Folder picker — loads all files so relative scripts resolve */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
          className="gap-1.5 text-xs h-7"
          title="Open the entire folder — rewrites relative script/CSS paths so local JS (Plotly, etc.) loads correctly"
        >
          <Folder className="h-3.5 w-3.5" />
          Open Folder
        </Button>

        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={fileName}>
            {fileName}
          </span>
        )}

        {blobUrl && (
          <>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { const i = ZOOM_STEPS.indexOf(zoom); if (i > 0) setZoom(ZOOM_STEPS[i - 1]); }}
                disabled={zoom <= ZOOM_STEPS[0]}
              ><ZoomOut className="h-3.5 w-3.5" /></Button>
              <button className="text-xs text-muted-foreground w-10 text-center" onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { const i = ZOOM_STEPS.indexOf(zoom); if (i < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[i + 1]); }}
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              ><ZoomIn className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} title="100%">
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>

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

        {/* Hidden inputs */}
        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleFileChange} />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          onChange={handleFolderChange}
          // @ts-expect-error — webkitdirectory is non-standard but universally supported
          webkitdirectory=""
          multiple
        />
      </div>

      {/* Iframe area */}
      <div className="flex-1 overflow-auto bg-gray-950" ref={containerRef}>
        {!blobUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <FolderOpen className="h-12 w-12 opacity-30" />
            <p className="text-sm text-center max-w-xs">
              Use <strong>Open Folder</strong> to load a dashboard with local JS (Plotly, etc.),
              or <strong>Open HTML File</strong> for self-contained pages.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FolderOpen className="h-4 w-4 mr-1.5" /> Open File
              </Button>
              <Button variant="secondary" onClick={() => folderInputRef.current?.click()}>
                <Folder className="h-4 w-4 mr-1.5" /> Open Folder
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative h-full" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
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
              className={`absolute inset-0 ${annotating ? "cursor-crosshair" : "pointer-events-none"}`}
              onClick={handleOverlayClick}
            >
              {pins.map((pin) => (
                <PinMarker key={pin.id} pin={pin} onClick={handlePinClick} />
              ))}
            </div>

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
