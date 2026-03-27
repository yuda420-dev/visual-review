"use client";

import { useRef, useCallback } from "react";
import { useReviewStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen, X } from "lucide-react";

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

export function ComparePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const depBlobsRef = useRef<string[]>([]);

  const rightBlobUrl = useReviewStore((s) => s.rightBlobUrl);
  const rightFileName = useReviewStore((s) => s.rightFileName);
  const loadRightFile = useReviewStore((s) => s.loadRightFile);

  const revokeDepBlobs = useCallback(() => {
    depBlobsRef.current.forEach(URL.revokeObjectURL);
    depBlobsRef.current = [];
  }, []);

  const doLoadRight = useCallback(
    (html: string, name: string, blobUrl: string) => {
      if (rightBlobUrl) URL.revokeObjectURL(rightBlobUrl);
      loadRightFile(blobUrl, name);
    },
    [rightBlobUrl, loadRightFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      revokeDepBlobs();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const blob = new Blob([content], { type: "text/html" });
        doLoadRight(content, file.name, URL.createObjectURL(blob));
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [doLoadRight, revokeDepBlobs]
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

      const raw = await htmlFile.text();
      const rewritten = rewriteRelativeUrls(raw, fileMap);
      const htmlBlob = new Blob([rewritten], { type: "text/html" });
      doLoadRight(raw, htmlFile.name, URL.createObjectURL(htmlBlob));
    },
    [doLoadRight, revokeDepBlobs]
  );

  const handleClear = useCallback(() => {
    if (rightBlobUrl) URL.revokeObjectURL(rightBlobUrl);
    revokeDepBlobs();
    loadRightFile("", "");
  }, [rightBlobUrl, revokeDepBlobs, loadRightFile]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card flex-none flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Compare:</span>
        <Button variant="default" size="sm" className="gap-1.5 text-xs h-7"
          onClick={() => folderInputRef.current?.click()}>
          <Folder className="h-3.5 w-3.5" /> Open Folder
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7"
          onClick={() => fileInputRef.current?.click()}>
          <FolderOpen className="h-3.5 w-3.5" /> File
        </Button>
        {rightFileName && (
          <>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={rightFileName}>
              {rightFileName}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto"
              onClick={handleClear} title="Close comparison">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden"
          onChange={handleFileChange} />
        <input ref={folderInputRef} type="file" className="hidden"
          onChange={handleFolderChange}
          // @ts-expect-error — non-standard but universally supported
          webkitdirectory="" multiple />
      </div>

      <div className="flex-1 overflow-auto bg-gray-950">
        {!rightBlobUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Folder className="h-10 w-10 opacity-20" />
            <p className="text-xs text-center max-w-xs">
              Load a second version to compare side-by-side
            </p>
            <Button variant="default" onClick={() => folderInputRef.current?.click()}>
              <Folder className="h-4 w-4 mr-1.5" /> Open Folder
            </Button>
          </div>
        ) : (
          <iframe
            src={rightBlobUrl}
            className="w-full h-full border-none block"
            style={{ minHeight: 400 }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups"
            title="Compare target"
          />
        )}
      </div>
    </div>
  );
}
