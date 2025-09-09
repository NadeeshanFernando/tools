// Wraps JSON localStorage with safe parsing/stringifying.
export function getJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
// Writes JSON to localStorage.
export function setJson<T>(key: string, value: T): void { localStorage.setItem(key, JSON.stringify(value)); }
