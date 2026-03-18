/**
 * Idempotency for integrator webhooks. Uses Postgres when DATABASE_URL is set (and not in test), else file store.
 */
import { env } from "@/config/env";
import * as fileStore from "./store";
import * as pgStore from "./pgStore";

const useDb =
  env.NODE_ENV !== "test" &&
  typeof env.DATABASE_URL === "string" &&
  env.DATABASE_URL.trim().length > 0;

export const isKeyValid = useDb ? pgStore.isKeyValid : fileStore.isKeyValid;
export const getCachedResponse = useDb ? pgStore.getCachedResponse : fileStore.getCachedResponse;
export const setCachedResponse = useDb ? pgStore.setCachedResponse : fileStore.setCachedResponse;

export type { CachedResponseHit } from "./store";

export async function resetIdempotencyStoreForTests(): Promise<void> {
  if (!useDb) await fileStore.resetIdempotencyStoreForTests();
  // pg store has no test reset; tests use separate DB or accept side effects
}
