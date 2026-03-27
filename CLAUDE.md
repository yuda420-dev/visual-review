# Visual Review Tool

## Project Overview
Single-page Next.js app for reviewing HTML files with click-to-pin annotation and a chat sidebar.
Open any local `.html` file, drop numbered pins on the page, and discuss each area in the chat panel.

## Tech Stack
- **Next.js 16** (App Router, no Turbopack)
- **React 19**
- **Tailwind CSS 4** (CSS-first, no tailwind.config.js)
- **shadcn/ui** (Tailwind v4 variant — components in `src/components/ui/`)
- **Zustand** (state + localStorage persistence)
- **html2canvas** (screenshot thumbnails from iframe content)

## Key Files
```
src/
├── app/
│   ├── layout.tsx          ← Root layout — sets dark class on <html>
│   ├── page.tsx            ← Main page: left (60%) + right (40%) layout
│   └── globals.css         ← Tailwind v4 imports + shadcn CSS vars (dark theme)
├── components/
│   ├── viewer/
│   │   ├── iframe-panel.tsx ← File picker, iframe, click overlay, zoom, pin markers
│   │   ├── pin-marker.tsx   ← Individual pin dot (red/yellow when selected)
│   │   └── pin-list.tsx     ← Pin inventory below iframe
│   └── chat/
│       ├── chat-panel.tsx   ← Full chat UI: header, messages, input
│       └── message-bubble.tsx ← Pin-ref messages vs user messages
└── lib/
    ├── types.ts            ← Pin and ChatMessage interfaces
    └── store.ts            ← Zustand store (persists pins/messages, not screenshots)
```

## How It Works

### File Loading
- User picks a `.html` file via file input
- FileReader reads content as text → Blob URL created
- Blob URL is same-origin — enables html2canvas + contentDocument access

### Annotation Flow
1. Toggle annotation mode (toolbar button or press `A`)
2. Click anywhere on iframe → transparent overlay captures coordinates
3. `elementFromPoint` on iframe's contentDocument gets element label
4. html2canvas takes a 400x300 screenshot around the click (graceful fallback if fails)
5. Pin created, pin-reference message auto-inserted in chat
6. Input auto-focuses for user comment

### Pin Coordinates
- Stored as **percentage of iframe viewport** at click time (`xPct`, `yPct`)
- Also store `scrollTop`/`scrollLeft` for restoration when jumping to a pin
- Percentage coordinates are zoom-independent

### State Persistence
- **Persisted**: `pins` (no screenshots), `messages` (no screenshots), `nextPinId`, `zoom`
- **Session-only**: `htmlContent`, `blobUrl`, `fileName`, `selectedPinId`, `annotating`
- Screenshots are large base64 strings — kept in-memory only

## Dev Commands
```bash
npm run dev     # localhost:3000
npm run build   # must pass clean
npm run lint    # ESLint
```

## Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `A` | Toggle annotation mode |
| `Esc` | Deselect pin / exit annotation mode |
| `1`-`9` | Jump to pin by number |
| `Enter` | Send chat message |
| `Shift+Enter` | New line in chat |

## Known Limitations
- html2canvas may not capture all CSS (external fonts, some SVGs)
- Screenshots not persisted to localStorage (size)
- One file per session

## GitHub
- Repo: yuda420-dev/visual-review
