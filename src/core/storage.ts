import type { Source } from './types';
const DB = 'iptvreader-db-v1';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('data');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function loadSources(): Promise<Source[]> {
  const d = await db();
  return new Promise((resolve,reject) => {
    const tx = d.transaction('data', 'readonly');
    const req = tx.objectStore('data').get('sources');
    req.onsuccess = () => resolve((req.result as Source[] | undefined) || []);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => d.close();
  });
}
export async function saveSources(sources: Source[]): Promise<void> {
  const d = await db();
  return new Promise((resolve,reject) => {
    const tx = d.transaction('data', 'readwrite');
    tx.objectStore('data').put(sources.filter(s => s.kind !== 'xtream'), 'sources');
    tx.oncomplete = () => { d.close(); resolve(); };
    tx.onerror = () => { d.close(); reject(tx.error); };
  });
}
export function favorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('iptvreader-favs') || '[]')); }
  catch { return new Set(); }
}
export function saveFavorites(ids: Set<string>): void { localStorage.setItem('iptvreader-favs', JSON.stringify([...ids])); }
