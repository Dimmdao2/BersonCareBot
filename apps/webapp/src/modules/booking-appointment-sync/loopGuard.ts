import { readSyncAttribution, type SyncAttributionMeta } from "./syncAttribution";

/** Suppress inbound Rubitime echo shortly after outbound canonical push. */
export const MIRROR_ECHO_SUPPRESS_MS = 8_000;

export function shouldSkipInboundRubitimeEcho(
  attribution: SyncAttributionMeta,
  nowMs: number = Date.now(),
): boolean {
  if (attribution.lastSyncedFrom !== "canonical" || !attribution.syncedAt) return false;
  const syncedMs = Date.parse(attribution.syncedAt);
  if (!Number.isFinite(syncedMs)) return false;
  return nowMs - syncedMs < MIRROR_ECHO_SUPPRESS_MS;
}

export function readAttributionFromJson(attributionJson: unknown): SyncAttributionMeta {
  return readSyncAttribution(attributionJson);
}
