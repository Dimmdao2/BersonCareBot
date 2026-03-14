/**
 * In-memory idempotency key store for webhook handlers.
 * MVP: TTL 24h; replace with DB-backed store when scaling.
 */
const MAX_KEY_LENGTH = 256;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type Entry = { expiresAt: number; responseBody: unknown };

const store = new Map<string, Entry>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function isKeyValid(key: string): boolean {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
}

/**
 * If key was already seen, returns the cached response body. Otherwise returns null (caller should process and then call setCachedResponse).
 */
export function getCachedResponse(key: string): unknown | null {
  purgeExpired();
  const entry = store.get(key);
  return entry ? entry.responseBody : null;
}

/**
 * Records the idempotency key and the response to return for duplicate requests.
 */
export function setCachedResponse(key: string, responseBody: unknown): void {
  purgeExpired();
  const now = Date.now();
  if (!store.has(key)) {
    store.set(key, { expiresAt: now + TTL_MS, responseBody });
  }
}
