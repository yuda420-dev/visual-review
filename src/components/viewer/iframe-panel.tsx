"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useReviewStore } from "@/lib/store";
import { saveRecentFile, getRecentFiles, deleteRecentFile } from "@/lib/recent-files";
import type { RecentFile } from "@/lib/recent-files";
import { PinMarker } from "./pin-marker";
import { PinList } from "./pin-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Pin } from "@/lib/types";
import {
  FolderOpen, Crosshair, ZoomIn, ZoomOut, Maximize,
  Folder, Clock, X, ChevronDown, AlertCircle,
} from "lucide-react";

// ── Screenshot ────────────────────────────────────────────────────────────────

async function captureScreenshot(
  iframe: HTMLIFrameElement,
  clickX: number,
  clickY: number
): Promise<string | null> {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return null;
    const html2canvas = (await import("html2canvas")).default;
    const sx = iframe.contentWindow?.scrollX ?? 0;
    const sy = iframe.contentWindow?.scrollY ?? 0;
    const canvas = await html2canvas(doc.body, {
      useCORS: true,
      allowTaint: true,
      x: sx + clickX - 200,
      y: sy + clickY - 150,
      width: 400,
      height: 300,
      logging: false,
    });
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

// ── Element label ─────────────────────────────────────────────────────────────

function getLabelAtPoint(iframe: HTMLIFrameElement, x: number, y: number): string {
  try {
    const el = iframe.contentDocument?.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return "unknown";
    const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40);
    if (text) return text;
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className
      ? `.${String(el.className).split(" ").filter(Boolean)[0] ?? ""}`
      : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  } catch {
    return "unknown";
  }
}

// ── Folder helpers ────────────────────────────────────────────────────────────

function getMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (
    {
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
    }[ext] ?? "application/octet-stream"
  );
}

function rewriteRelativeUrls(html: string, fileMap: Map<string, string>): string {
  return html.replace(/(\bsrc="|href=")([^"]+)(")/g, (match, pre, path, post) => {
    if (/^(https?:|\/\/|data:|blob:|#|\/)/.test(path)) return match;
    const url = fileMap.get(path) ?? fileMap.get(path.split("/").pop() ?? "");
    return url ? `${pre}${url}${post}` : match;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IframePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const depBlobsRef = useRef<string[]>([]);

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [hoverRect, setHoverRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);

  const blobUrl = useReviewStore((s) => s.blobUrl);
  const fileName = useReviewStore((s) => s.fileName);
  const pins = useReviewStore((s) => s.pins);
  const zoom = useReviewStore((s) => s.zoom);
  const annotating = useReviewStore((s) => s.annotating);

  const {
    loadFile,
    addPin,
    addMessage,
    updatePinScreenshot,
    updateMessageScreenshot,
    selectPin,
    setAnnotating,
    setZoom,
  } = useReviewStore();

  // Load recent files on mount
  useEffect(() => {
    getRecentFiles().then(setRecentFiles);
  }, []);

  const revokeDepBlobs = useCallback(() => {
    depBlobsRef.current.forEach(URL.revokeObjectURL);
    depBlobsRef.current = [];
  }, []);

  // ── Save + load helpers ───────────────────────────────────────────────────

  const doLoad = useCallback(
    async (htmlContent: string, name: string, finalBlobUrl: string, fromFolder: boolean) => {
      loadFile(htmlContent, name, finalBlobUrl);
      // Save to recent (use raw HTML, not blob URLs — those are session-only)
      await saveRecentFile({ name, htmlContent, fromFolder, savedAt: Date.now() });
      setRecentFiles(await getRecentFiles());
    },
    [loadFile]
  );

  // ── Single file ───────────────────────────────────────────────────────────

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
        doLoad(content, file.name, url, false);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [doLoad, revokeDepBlobs]
  );

  // ── Folder ────────────────────────────────────────────────────────────────

  const handleFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      e.target.value = "";

      const htmlFiles = files.filter((f) => /\.(html|htm)$/i.test(f.name));
      if (!htmlFiles.length) { alert("No .html file found in folder."); return; }

      // Pick shallowest (root-level) HTML file
      const htmlFile = htmlFiles.sort((a, b) => {
        const da = (a.webkitRelativePath || a.name).split("/").length;
        const db = (b.webkitRelativePath || b.name).split("/").length;
        return da - db || a.name.localeCompare(b.name);
      })[0];

      revokeDepBlobs();

      // Build blob URL map for assets
      const fileMap = new Map<string, string>();
      await Promise.all(
        files
          .filter((f) => f !== htmlFile)
          .map(async (f) => {
            const buf = await f.arrayBuffer();
            const url = URL.createObjectURL(
              new Blob([buf], { type: getMimeType(f.name) })
            );
            depBlobsRef.current.push(url);
            fileMap.set(f.name, url);
            const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/");
            if (rel) fileMap.set(rel, url);
          })
      );

      const rawHtml = await htmlFile.text();
      const rewritten = rewriteRelativeUrls(rawHtml, fileMap);
      const htmlBlob = new Blob([rewritten], { type: "text/html" });
      const htmlUrl = URL.createObjectURL(htmlBlob);

      doLoad(rawHtml, htmlFile.name, htmlUrl, true);
    },
    [doLoad, revokeDepBlobs]
  );

  // ── Reload from recent ────────────────────────────────────────────────────

  const handleReloadRecent = useCallback(
    (rf: RecentFile) => {
      revokeDepBlobs();
      setRecentOpen(false);
      // If it came from a folder load, local scripts (Plotly etc.) won't be
      // available without re-picking the folder. We load as-is (CDN scripts work).
      const blob = new Blob([rf.htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      loadFile(rf.htmlContent, rf.name, url);
    },
    [loadFile, revokeDepBlobs]
  );

  const handleDeleteRecent = useCallback(async (name: string) => {
    await deleteRecentFile(name);
    setRecentFiles(await getRecentFiles());
  }, []);

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

      const pinId = addPin({ xPct, yPct, scrollTop, scrollLeft, label, screenshot: null });
      addMessage({ type: "pin", pinId, content: `📍 Pin #${pinId} — ${label}`, screenshot: null });
      selectPin(pinId);

      // Screenshot in background — UI stays responsive
      captureScreenshot(iframe, clickX, clickY).then((ss) => {
        if (ss) {
          updatePinScreenshot(pinId, ss);
          updateMessageScreenshot(pinId, ss);
        }
      });
    },
    [annotating, addPin, addMessage, updatePinScreenshot, updateMessageScreenshot, selectPin]
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      selectPin(pin.id);
      iframeRef.current?.contentWindow?.scrollTo({
        top: pin.scrollTop,
        left: pin.scrollLeft,
        behavior: "smooth",
      });
      if (containerRef.current) {
        const pinY = (pin.yPct / 100) * containerRef.current.clientHeight;
        containerRef.current.scrollTo({ top: pinY - 150, behavior: "smooth" });
      }
    },
    [selectPin]
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") { selectPin(null); setAnnotating(false); setRecentOpen(false); }
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
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card flex-none flex-wrap">
        {/* Open folder (primary — needed for local scripts) */}
        <Button
          variant="default"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
          className="gap-1.5 text-xs h-7"
          title="Open the containing folder so local scripts (Plotly, etc.) load correctly"
        >
          <Folder className="h-3.5 w-3.5" />
          Open Folder
        </Button>

        {/* Open single file */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 text-xs h-7"
          title="Single .html file — works for CDN-only dashboards; local scripts won't load"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          File
        </Button>

        {/* Recent files dropdown */}
        {recentFiles.length > 0 && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-1 text-xs h-7 ${recentOpen ? "bg-muted" : ""}`}
              onClick={() => setRecentOpen((v) => !v)}
              title="Recently opened files"
            >
              <Clock className="h-3.5 w-3.5" />
              Recent
              <ChevronDown className="h-3 w-3" />
            </Button>

            {recentOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-xl min-w-[260px] max-w-[340px] overflow-hidden">
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium uppercase tracking-wide">
                  Recently opened
                </div>
                {recentFiles.map((rf) => (
                  <div
                    key={rf.name}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 cursor-pointer group"
                  >
                    <span
                      className="flex-1 text-xs truncate"
                      onClick={() => handleReloadRecent(rf)}
                      title={rf.name}
                    >
                      {rf.name}
                    </span>
                    {rf.fromFolder && (
                      <span
                        className="text-[9px] text-amber-500/70 flex-none"
                        title="Was loaded from a folder — use Open Folder to get local scripts"
                      >
                        <AlertCircle className="h-3 w-3" />
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/50 flex-none">
                      {new Date(rf.savedAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-none"
                      onClick={(e) => { e.stopPropagation(); handleDeleteRecent(rf.name); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {fileName && (
          <span
            className="text-xs text-muted-foreground truncate max-w-[160px] ml-1"
            title={fileName}
          >
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
              <button
                className="text-xs text-muted-foreground w-10 text-center"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { const i = ZOOM_STEPS.indexOf(zoom); if (i < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[i + 1]); }}
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              ><ZoomIn className="h-3.5 w-3.5" /></Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setZoom(1)} title="100%"
              ><Maximize className="h-3.5 w-3.5" /></Button>
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
                {pins.length}
              </Badge>
            )}
          </>
        )}

        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleFileChange} />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          onChange={handleFolderChange}
          // @ts-expect-error — non-standard but universally supported
          webkitdirectory=""
          multiple
        />
      </div>

      {/* Click outside to close recent dropdown */}
      {recentOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setRecentOpen(false)} />
      )}

      {/* Iframe area */}
      <div className="flex-1 overflow-auto bg-gray-950" ref={containerRef}>
        {!blobUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <Folder className="h-12 w-12 opacity-30" />
            <p className="text-sm text-center max-w-xs">
              Use <strong>Open Folder</strong> to load dashboards with local JS (Plotly, etc.)
              <br />
              <span className="text-xs opacity-60">
                Use <strong>File</strong> for self-contained or CDN-only HTML
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => folderInputRef.current?.click()}>
                <Folder className="h-4 w-4 mr-1.5" /> Open Folder
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FolderOpen className="h-4 w-4 mr-1.5" /> Open File
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
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups"
              title="Review target"
            />

            <div
              ref={overlayRef}
              className={`absolute inset-0 ${annotating ? "cursor-crosshair" : "pointer-events-none"}`}
              onClick={handleOverlayClick}
              onMouseMove={annotating ? (e) => {
                const rect = overlayRef.current!.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (!doc) { setHoverRect(null); return; }
                  const el = doc.elementFromPoint(x, y) as HTMLElement | null;
                  if (!el || el === doc.documentElement || el === doc.body) { setHoverRect(null); return; }
                  const er = el.getBoundingClientRect();
                  // Skip elements that take up most of the viewport (containers/wrappers)
                  if (er.width > rect.width * 0.9 || er.height > rect.height * 0.85) { setHoverRect(null); return; }
                  setHoverRect({ l: er.left, t: er.top, w: er.width, h: er.height });
                } catch { setHoverRect(null); }
              } : undefined}
              onMouseLeave={annotating ? () => setHoverRect(null) : undefined}
            >
              {/* Hover highlight */}
              {annotating && hoverRect && (
                <div
                  className="absolute pointer-events-none border-2 border-blue-400/80 bg-blue-400/10 rounded-sm z-10 transition-all duration-75"
                  style={{ left: hoverRect.l, top: hoverRect.t, width: hoverRect.w, height: hoverRect.h }}
                />
              )}
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

      {pins.length > 0 && (
        <div className="flex-none border-t border-border bg-card px-3 py-2 max-h-36 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-1 font-medium">
            Pins — click to jump (keys 1-9)
          </p>
          <PinList onPinClick={handlePinClick} />
        </div>
      )}
    </div>
  );
}
