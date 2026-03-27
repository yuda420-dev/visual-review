"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useReviewStore } from "@/lib/store";
import { saveRecentFile, getRecentFiles, deleteRecentFile } from "@/lib/recent-files";
import type { RecentFile } from "@/lib/recent-files";
import { PinMarker } from "./pin-marker";
import { PinList } from "./pin-list";
import { CategorySelector } from "./category-selector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CAT_META } from "@/lib/types";
import type { Pin, PinCategory } from "@/lib/types";
import {
  FolderOpen, Crosshair, ZoomIn, ZoomOut, Maximize,
  Folder, Clock, X, ChevronDown, AlertCircle,
  RefreshCw, Columns, Globe,
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
      useCORS: true, allowTaint: true,
      x: sx + clickX - 200, y: sy + clickY - 150,
      width: 400, height: 300, logging: false,
    });
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch { return null; }
}

// ── Element label ─────────────────────────────────────────────────────────────

function getLabelAtPoint(iframe: HTMLIFrameElement, x: number, y: number): string {
  try {
    const el = iframe.contentDocument?.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return "unknown";
    const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40);
    if (text) return text;
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className ? `.${String(el.className).split(" ").filter(Boolean)[0] ?? ""}` : "";
    return `<${el.tagName.toLowerCase()}${id}${cls}>`;
  } catch { return "unknown"; }
}

// ── Folder helpers ────────────────────────────────────────────────────────────

function getMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ({
    js: "application/javascript", mjs: "application/javascript",
    css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
    json: "application/json", webp: "image/webp",
  }[ext] ?? "application/octet-stream");
}

function rewriteRelativeUrls(html: string, fileMap: Map<string, string>): string {
  return html.replace(/(\bsrc="|href=")([^"]+)(")/g, (match, pre, p, post) => {
    if (/^(https?:|\/\/|data:|blob:|#|\/)/.test(p)) return match;
    const url = fileMap.get(p) ?? fileMap.get(p.split("/").pop() ?? "");
    return url ? `${pre}${url}${post}` : match;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingClick {
  screenX: number; screenY: number;
  clickX: number; clickY: number;
  xPct: number; yPct: number;
  label: string;
  scrollTop: number; scrollLeft: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IframePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const depBlobsRef = useRef<string[]>([]);
  const reloadFnRef = useRef<((f: string) => Promise<void>) | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [hoverRect, setHoverRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const [pendingClick, setPendingClick] = useState<PendingClick | null>(null);

  // Server-mode state
  const [pathOpen, setPathOpen] = useState(false);
  const [dirInput, setDirInput] = useState("");
  const [htmlInput, setHtmlInput] = useState("");
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const blobUrl = useReviewStore((s) => s.blobUrl);
  const fileName = useReviewStore((s) => s.fileName);
  const pins = useReviewStore((s) => s.pins);
  const zoom = useReviewStore((s) => s.zoom);
  const annotating = useReviewStore((s) => s.annotating);
  const dirPath = useReviewStore((s) => s.dirPath);
  const htmlFile = useReviewStore((s) => s.htmlFile);
  const autoReload = useReviewStore((s) => s.autoReload);
  const compareMode = useReviewStore((s) => s.compareMode);

  const {
    loadFile, addPin, addMessage, updatePinScreenshot, updateMessageScreenshot,
    selectPin, setAnnotating, setZoom, setDirPath, setHtmlFile,
    setAutoReload, setCompareMode,
  } = useReviewStore();

  // Keep blobUrlRef in sync for auto-reload cleanup
  useEffect(() => { blobUrlRef.current = blobUrl; }, [blobUrl]);

  // Initialize inputs from persisted store values
  useEffect(() => {
    if (dirPath) setDirInput(dirPath);
    if (htmlFile) setHtmlInput(htmlFile);
    if (dirPath && htmlFile) setPathOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentional once-on-mount

  // Load recent files on mount
  useEffect(() => { getRecentFiles().then(setRecentFiles); }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const revokeDepBlobs = useCallback(() => {
    depBlobsRef.current.forEach(URL.revokeObjectURL);
    depBlobsRef.current = [];
  }, []);

  // ── Auto-reload from server ────────────────────────────────────────────────

  const reloadFromServer = useCallback(async (file: string) => {
    try {
      const res = await fetch(`/api/serve?htmlFile=${encodeURIComponent(file)}`);
      if (!res.ok) return;
      const { html } = await res.json();
      const old = blobUrlRef.current;
      if (old) URL.revokeObjectURL(old);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      loadFile(html, file, url);
      showToast(`Reloaded — ${new Date().toLocaleTimeString()}`);
    } catch { /* ignore */ }
  }, [loadFile, showToast]);

  reloadFnRef.current = reloadFromServer;

  useEffect(() => {
    if (!autoReload || !dirPath || !htmlFile) return;
    let lastMtime: number | null = null;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/poll?dirPath=${encodeURIComponent(dirPath)}&htmlFile=${encodeURIComponent(htmlFile)}`
        );
        if (!res.ok) return;
        const { mtime } = await res.json();
        if (lastMtime === null) { lastMtime = mtime; return; }
        if (mtime > lastMtime) {
          lastMtime = mtime;
          reloadFnRef.current?.(htmlFile);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(id);
  }, [autoReload, dirPath, htmlFile]);

  // ── File loading ──────────────────────────────────────────────────────────

  const doLoad = useCallback(
    async (htmlContent: string, name: string, finalBlobUrl: string, fromFolder: boolean) => {
      loadFile(htmlContent, name, finalBlobUrl);
      await saveRecentFile({ name, htmlContent, fromFolder, savedAt: Date.now() });
      setRecentFiles(await getRecentFiles());
    },
    [loadFile]
  );

  const handleServerLoad = useCallback(async () => {
    const d = dirInput.trim();
    const f = htmlInput.trim();
    if (!d || !f) return;
    setServerLoading(true);
    setServerError("");
    try {
      const res = await fetch("/api/serve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath: d, htmlFile: f }),
      });
      const data = await res.json();
      if (!res.ok) { setServerError(data.error || "Failed to start server"); return; }
      const old = blobUrlRef.current;
      if (old) URL.revokeObjectURL(old);
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      loadFile(data.html, f, url);
      setDirPath(d);
      setHtmlFile(f);
    } catch (err) {
      setServerError(String(err));
    } finally {
      setServerLoading(false);
    }
  }, [dirInput, htmlInput, loadFile, setDirPath, setHtmlFile]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      revokeDepBlobs();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const blob = new Blob([content], { type: "text/html" });
        doLoad(content, file.name, URL.createObjectURL(blob), false);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [doLoad, revokeDepBlobs]
  );

  const handleFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      e.target.value = "";

      const htmlFiles = files.filter((f) => /\.(html|htm)$/i.test(f.name));
      if (!htmlFiles.length) { alert("No .html file found in folder."); return; }

      const htmlFile = htmlFiles.sort((a, b) => {
        const da = (a.webkitRelativePath || a.name).split("/").length;
        const db = (b.webkitRelativePath || b.name).split("/").length;
        return da - db || a.name.localeCompare(b.name);
      })[0];

      revokeDepBlobs();
      const fileMap = new Map<string, string>();
      await Promise.all(
        files.filter((f) => f !== htmlFile).map(async (f) => {
          const buf = await f.arrayBuffer();
          const url = URL.createObjectURL(new Blob([buf], { type: getMimeType(f.name) }));
          depBlobsRef.current.push(url);
          fileMap.set(f.name, url);
          const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/");
          if (rel) fileMap.set(rel, url);
        })
      );

      const rawHtml = await htmlFile.text();
      const rewritten = rewriteRelativeUrls(rawHtml, fileMap);
      const htmlBlob = new Blob([rewritten], { type: "text/html" });
      doLoad(rawHtml, htmlFile.name, URL.createObjectURL(htmlBlob), true);
    },
    [doLoad, revokeDepBlobs]
  );

  const handleReloadRecent = useCallback(
    (rf: RecentFile) => {
      revokeDepBlobs();
      setRecentOpen(false);
      const blob = new Blob([rf.htmlContent], { type: "text/html" });
      loadFile(rf.htmlContent, rf.name, URL.createObjectURL(blob));
    },
    [loadFile, revokeDepBlobs]
  );

  const handleDeleteRecent = useCallback(async (name: string) => {
    await deleteRecentFile(name);
    setRecentFiles(await getRecentFiles());
  }, []);

  // ── Annotation ────────────────────────────────────────────────────────────

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
      setPendingClick({ screenX: e.clientX, screenY: e.clientY, clickX, clickY, xPct, yPct, label, scrollTop, scrollLeft });
    },
    [annotating]
  );

  const handleCategorySelect = useCallback(
    (category: PinCategory) => {
      if (!pendingClick || !iframeRef.current) { setPendingClick(null); return; }
      const { clickX, clickY, xPct, yPct, label, scrollTop, scrollLeft } = pendingClick;
      setPendingClick(null);
      const iframe = iframeRef.current;
      const meta = CAT_META[category];
      const pinId = addPin({ xPct, yPct, scrollTop, scrollLeft, label, screenshot: null, category });
      addMessage({ type: "pin", pinId, content: `${meta.emoji} Pin #${pinId} — ${label}`, screenshot: null });
      selectPin(pinId);
      captureScreenshot(iframe, clickX, clickY).then((ss) => {
        if (ss) { updatePinScreenshot(pinId, ss); updateMessageScreenshot(pinId, ss); }
      });
    },
    [pendingClick, addPin, addMessage, updatePinScreenshot, updateMessageScreenshot, selectPin]
  );

  const handlePinClick = useCallback(
    (pin: Pin) => {
      selectPin(pin.id);
      iframeRef.current?.contentWindow?.scrollTo({ top: pin.scrollTop, left: pin.scrollLeft, behavior: "smooth" });
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
      if (e.key === "Escape") {
        setPendingClick(null);
        selectPin(null);
        setAnnotating(false);
        setRecentOpen(false);
      }
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
      {/* Main toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card flex-none flex-wrap">
        {/* Server mode toggle */}
        <Button
          variant={pathOpen ? "default" : "outline"}
          size="sm"
          onClick={() => setPathOpen((v) => !v)}
          className="gap-1.5 text-xs h-7"
          title="Load via local HTTP server (required for Plotly + auto-reload)"
        >
          <Globe className="h-3.5 w-3.5" />
          Server
        </Button>

        {/* Folder picker */}
        <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}
          className="gap-1.5 text-xs h-7" title="Open folder (blob URL mode)">
          <Folder className="h-3.5 w-3.5" /> Folder
        </Button>

        {/* Single file */}
        <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 text-xs h-7" title="Open single .html file">
          <FolderOpen className="h-3.5 w-3.5" /> File
        </Button>

        {/* Recent files */}
        {recentFiles.length > 0 && (
          <div className="relative">
            <Button
              variant="ghost" size="sm"
              className={`gap-1 text-xs h-7 ${recentOpen ? "bg-muted" : ""}`}
              onClick={() => setRecentOpen((v) => !v)}
            >
              <Clock className="h-3.5 w-3.5" /> Recent <ChevronDown className="h-3 w-3" />
            </Button>
            {recentOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-xl min-w-[260px] max-w-[340px] overflow-hidden">
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium uppercase tracking-wide">
                  Recently opened
                </div>
                {recentFiles.map((rf) => (
                  <div key={rf.name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 cursor-pointer group">
                    <span className="flex-1 text-xs truncate" onClick={() => handleReloadRecent(rf)} title={rf.name}>
                      {rf.name}
                    </span>
                    {rf.fromFolder && (
                      <span className="text-[9px] text-amber-500/70 flex-none" title="Loaded from folder">
                        <AlertCircle className="h-3 w-3" />
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/50 flex-none">
                      {new Date(rf.savedAt).toLocaleDateString()}
                    </span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-none"
                      onClick={(e) => { e.stopPropagation(); handleDeleteRecent(rf.name); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-[140px] ml-1" title={fileName}>
            {fileName}
          </span>
        )}

        {blobUrl && (
          <>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { const i = ZOOM_STEPS.indexOf(zoom); if (i > 0) setZoom(ZOOM_STEPS[i - 1]); }}
                disabled={zoom <= ZOOM_STEPS[0]}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button className="text-xs text-muted-foreground w-10 text-center" onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { const i = ZOOM_STEPS.indexOf(zoom); if (i < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[i + 1]); }}
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} title="100%">
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Compare toggle */}
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => setCompareMode(!compareMode)}
              title="Side-by-side compare mode"
            >
              <Columns className="h-3.5 w-3.5" />
              Compare
            </Button>

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
              <Badge variant="secondary" className="text-xs h-5 px-1.5">{pins.length}</Badge>
            )}
          </>
        )}

        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" onChange={handleFileChange} />
        <input ref={folderInputRef} type="file" className="hidden" onChange={handleFolderChange}
          // @ts-expect-error — non-standard but universally supported
          webkitdirectory="" multiple />
      </div>

      {/* Server-mode path section */}
      {pathOpen && (
        <div className="flex-none border-b border-border bg-muted/30 px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="text"
              value={dirInput}
              onChange={(e) => setDirInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleServerLoad(); }}
              placeholder="Directory path, e.g. /Users/me/RR"
              className="flex-1 min-w-[160px] bg-background border border-input rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleServerLoad(); }}
              placeholder="filename.html"
              className="w-36 bg-background border border-input rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              size="sm" className="h-7 text-xs gap-1.5"
              onClick={handleServerLoad}
              disabled={serverLoading || !dirInput.trim() || !htmlInput.trim()}
            >
              {serverLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
              {serverLoading ? "Loading…" : "Load"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoReload}
                onChange={(e) => setAutoReload(e.target.checked)}
                className="rounded"
              />
              Auto-reload on file change
            </label>
            {dirPath && htmlFile && blobUrl && (
              <button
                onClick={() => reloadFnRef.current?.(htmlFile)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Reload now"
              >
                <RefreshCw className="h-3 w-3" /> Reload now
              </button>
            )}
          </div>
          {serverError && (
            <p className="text-xs text-destructive">{serverError}</p>
          )}
        </div>
      )}

      {/* Click-outside for recent dropdown */}
      {recentOpen && <div className="fixed inset-0 z-40" onClick={() => setRecentOpen(false)} />}

      {/* Category selector portal */}
      {pendingClick && (
        <CategorySelector
          screenX={pendingClick.screenX}
          screenY={pendingClick.screenY}
          onSelect={handleCategorySelect}
          onCancel={() => setPendingClick(null)}
        />
      )}

      {/* Iframe area */}
      <div className="flex-1 overflow-auto bg-gray-950 relative" ref={containerRef}>
        {/* Toast */}
        {toast && (
          <div className="absolute top-2 right-2 z-50 bg-green-700/90 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none">
            {toast}
          </div>
        )}

        {!blobUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <Globe className="h-12 w-12 opacity-20" />
            <p className="text-sm text-center max-w-xs">
              Use <strong>Server</strong> for dashboards with Plotly/local scripts
              <br />
              <span className="text-xs opacity-60">Use <strong>Folder</strong> or <strong>File</strong> for CDN-only HTML</span>
            </p>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => setPathOpen(true)}>
                <Globe className="h-4 w-4 mr-1.5" /> Server
              </Button>
              <Button variant="outline" onClick={() => folderInputRef.current?.click()}>
                <Folder className="h-4 w-4 mr-1.5" /> Folder
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

            {annotating && !pendingClick && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none z-30">
                Click to place a pin — Esc to exit
              </div>
            )}
            {annotating && pendingClick && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-card border border-border text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none z-30 text-foreground">
                Choose pin type…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pin list */}
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
