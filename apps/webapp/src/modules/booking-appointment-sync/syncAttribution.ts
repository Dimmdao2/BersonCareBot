import type { SyncOrigin } from "./types";

export const SYNC_ATTRIBUTION_KEYS = {
  lastSyncedFrom: "mirror_last_synced_from",
  syncedAt: "mirror_synced_at",
  syncVersion: "mirror_sync_version",
} as const;

export type SyncAttributionMeta = {
  lastSyncedFrom: SyncOrigin | null;
  syncedAt: string | null;
  syncVersion: number;
};

export function readSyncAttribution(attributionJson: unknown): SyncAttributionMeta {
  if (!attributionJson || typeof attributionJson !== "object" || Array.isArray(attributionJson)) {
    return { lastSyncedFrom: null, syncedAt: null, syncVersion: 0 };
  }
  const o = attributionJson as Record<string, unknown>;
  const from = o[SYNC_ATTRIBUTION_KEYS.lastSyncedFrom];
  const at = o[SYNC_ATTRIBUTION_KEYS.syncedAt];
  const ver = o[SYNC_ATTRIBUTION_KEYS.syncVersion];
  return {
    lastSyncedFrom: from === "rubitime" || from === "canonical" ? from : null,
    syncedAt: typeof at === "string" ? at : null,
    syncVersion: typeof ver === "number" && Number.isFinite(ver) ? Math.max(0, Math.trunc(ver)) : 0,
  };
}

export function withSyncAttributionStamp(
  attributionJson: unknown,
  origin: SyncOrigin,
  syncedAt: string = new Date().toISOString(),
): Record<string, unknown> {
  const base =
    attributionJson && typeof attributionJson === "object" && !Array.isArray(attributionJson)
      ? { ...(attributionJson as Record<string, unknown>) }
      : {};
  const prior = readSyncAttribution(attributionJson);
  return {
    ...base,
    [SYNC_ATTRIBUTION_KEYS.lastSyncedFrom]: origin,
    [SYNC_ATTRIBUTION_KEYS.syncedAt]: syncedAt,
    [SYNC_ATTRIBUTION_KEYS.syncVersion]: prior.syncVersion + 1,
  };
}
