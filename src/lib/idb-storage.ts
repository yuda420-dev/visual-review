// Zustand-compatible async storage backed by IndexedDB.
// Pins/messages survive dashboard's localStorage.clear() calls.

import { openDb } from "./idb";

const STORE = "zustand-store";

export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    try {
      const db = await openDb();
      return new Promise((resolve) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
        req.onsuccess = () => resolve((req.result as string) ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // silently ignore — non-critical
    }
  },

  async removeItem(name: string): Promise<void> {
    try {
      const db = await openDb();
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(name);
    } catch {
      // ignore
    }
  },
};
