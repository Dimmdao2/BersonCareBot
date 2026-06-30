/**
 * Idempotency for integrator webhooks. Uses Postgres when DATABASE_URL is set (and
 * not in test), else a file store.
 *
 * The file store is a dev/test-only fallback (used when there is no DATABASE_URL).
 * It is imported LAZILY with `turbopackIgnore` so its `node:fs` operations are never
 * statically traced into the production (DB-backed) standalone bundle — that trace
 * otherwise pulls `next.config.ts` into the NFT list and emits a build warning.
 */
import type { CachedResponseHit } from "./store";
import { env } from "@/config/env";
import * as pgStore from "./pgStore";

const useDb =
  env.NODE_ENV !== "test" &&
  typeof env.DATABASE_URL === "string" &&
  env.DATABASE_URL.trim().length > 0;

/** Dev/test fallback only — never reached in production (DATABASE_URL is always set there). */
function loadFileStore(): Promise<typeof import("./store")> {
  return import(/* turbopackIgnore: true */ "./store");
}

// Pure key validation (no IO) — identical in both stores; use the pg one so this
// export stays synchronous and does not statically pull in the file store.
export const isKeyValid = pgStore.isKeyValid;

export async function getCachedResponse(
  key: string,
  requestHash: string,
): Promise<CachedResponseHit> {
  if (useDb) return pgStore.getCachedResponse(key, requestHash);
  return (await loadFileStore()).getCachedResponse(key, requestHash);
}

export async function setCachedResponse(
  key: string,
  requestHash: string,
  status: number,
  responseBody: Record<string, unknown>,
): Promise<boolean> {
  if (useDb) return pgStore.setCachedResponse(key, requestHash, status, responseBody);
  return (await loadFileStore()).setCachedResponse(key, requestHash, status, responseBody);
}

export type { CachedResponseHit };

export async function resetIdempotencyStoreForTests(): Promise<void> {
  if (!useDb) await (await loadFileStore()).resetIdempotencyStoreForTests();
  // pg store has no test reset; tests use a separate DB or accept side effects.
}
