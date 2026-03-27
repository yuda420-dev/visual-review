// Centralized IndexedDB — single DB, versioned stores

export const DB_NAME = "visual-review";
export const DB_VERSION = 2;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const old = e.oldVersion;
      // v1: recent-files store
      if (old < 1) db.createObjectStore("recent-files", { keyPath: "name" });
      // v2: zustand store (key-value)
      if (old < 2) db.createObjectStore("zustand-store");
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
