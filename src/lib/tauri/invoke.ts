// Adds timeout + typed invoke wrappers.
import { invoke } from "@tauri-apps/api/core";

// Waits for a given number of milliseconds.
export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

// Races a promise with a timeout.
export async function withTimeout<T>(p: Promise<T>, ms: number, label="operation"): Promise<T> {
  const t = sleep(ms).then(() => { throw new Error(`${label} timed out`); });
  return Promise.race([p, t]) as Promise<T>;
}

// Invokes a Tauri command with an optional timeout.
export async function invokeSafe<T>(cmd: string, args: any, timeoutMs=60000, label=cmd): Promise<T> {
  return withTimeout(invoke<T>(cmd, args), timeoutMs, label);
}
