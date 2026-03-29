/**
 * IndexedDB persistence for the TLE catalog.
 *
 * Why IndexedDB instead of only localStorage:
 * - localStorage is limited to ~5MB and can be cleared by the browser
 * - IndexedDB quota is typically 10–50% of available disk space
 * - Survives browser restarts, hard refreshes, and most "clear site data" flows
 *
 * This acts as a long-lived fallback: if CelesTrak is unreachable and localStorage
 * is stale/cleared, we serve the last successfully fetched catalog even if it is
 * a few hours old. SGP4 propagation remains accurate for several days on LEO TLEs.
 */

import type { TleRecord } from "../types/satellite";

const DB_NAME = "orbit-db";
const DB_VERSION = 1;
const STORE = "tle-catalog";
const CATALOG_KEY = "catalog";

interface CatalogEntry {
  records: TleRecord[];
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCatalog(records: TleRecord[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ records, timestamp: Date.now() } satisfies CatalogEntry, CATALOG_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("[tleStore] Failed to save catalog to IndexedDB:", err);
  }
}

export async function loadCatalog(): Promise<CatalogEntry | null> {
  try {
    const db = await openDB();
    const entry = await new Promise<CatalogEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(CATALOG_KEY);
      req.onsuccess = () => resolve((req.result as CatalogEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entry;
  } catch (err) {
    console.warn("[tleStore] Failed to load catalog from IndexedDB:", err);
    return null;
  }
}
