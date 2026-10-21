const STORAGE_KEY = "lumen-browser-id";

// Stable per-browser identity (survives across tabs, not across devices/profiles),
// used to detect the same person opening a room in more than one tab.
export function getBrowserId(storage: Storage = localStorage): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, generated);
  return generated;
}
