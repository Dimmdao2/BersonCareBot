import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_KEY_LENGTH = 256;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type Entry = {
  expiresAt: number;
  requestHash: string;
  status: number;
  responseBody: Record<string, unknown>;
};

type IdempotencyRecord = Record<string, Entry>;

let memoryCache: IdempotencyRecord | null = null;

function getStorePath(): string {
  if (process.env.IDEMPOTENCY_STORE_PATH && process.env.IDEMPOTENCY_STORE_PATH.trim().length > 0) {
    return process.env.IDEMPOTENCY_STORE_PATH;
  }
  return path.join(process.cwd(), ".data", "idempotency-store.json");
}

async function loadStore(): Promise<IdempotencyRecord> {
  if (memoryCache) return memoryCache;
  const filePath = getStorePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as IdempotencyRecord;
    memoryCache = typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

async function persistStore(store: IdempotencyRecord): Promise<void> {
  const filePath = getStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store), "utf8");
}

function purgeExpiredInPlace(store: IdempotencyRecord): boolean {
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
      delete store[key];
      changed = true;
    }
  }
  return changed;
}

export function isKeyValid(key: string): boolean {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

export type CachedResponseHit =
  | { hit: true; status: number; body: Record<string, unknown> }
  | { hit: false }
  | { hit: true; mismatch: true };

export async function getCachedResponse(
  key: string,
  requestHash: string,
): Promise<CachedResponseHit> {
  const store = await loadStore();
  if (purgeExpiredInPlace(store)) await persistStore(store);
  const entry = store[key];
  if (!entry) return { hit: false };
  if (entry.requestHash !== requestHash) return { hit: true, mismatch: true };
  return { hit: true, status: entry.status, body: entry.responseBody };
}

/** @returns true if stored; file store has no race so always true when we write */
export async function setCachedResponse(
  key: string,
  requestHash: string,
  status: number,
  responseBody: Record<string, unknown>,
): Promise<boolean> {
  const store = await loadStore();
  if (purgeExpiredInPlace(store)) {
    // keep cleaned state before writing current response
  }
  if (!store[key]) {
    store[key] = {
      expiresAt: Date.now() + TTL_MS,
      requestHash,
      status,
      responseBody,
    };
    await persistStore(store);
  }
  return true;
}

export async function resetIdempotencyStoreForTests(): Promise<void> {
  memoryCache = {};
  await persistStore(memoryCache);
}
