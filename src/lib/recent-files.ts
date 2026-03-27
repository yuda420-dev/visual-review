// IndexedDB store for recently loaded HTML files (persists across sessions)

const DB_NAME = "visual-review";
const STORE = "recent-files";
const MAX = 6;

export interface RecentFile {
  name: string;
  htmlContent: string;
  fromFolder: boolean; // true = needs folder re-pick for local scripts
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecentFile(file: RecentFile): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(file);

    // Trim to MAX entries — delete oldest first
    const all: RecentFile[] = await new Promise((res) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => res([]);
    });
    if (all.length > MAX) {
      all
        .sort((a, b) => a.savedAt - b.savedAt)
        .slice(0, all.length - MAX)
        .forEach((f) => store.delete(f.name));
    }
  } catch {
    // silently ignore — non-critical
  }
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const req = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as RecentFile[]).sort((a, b) => b.savedAt - a.savedAt)
        );
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteRecentFile(name: string): Promise<void> {
  try {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(name);
  } catch {
    // ignore
  }
}
