import type { MediaAvailableQuality } from "@/modules/media/types";

/** Select value for automatic HLS level selection (hls.js ABR). */
export const PATIENT_HLS_QUALITY_AUTO_VALUE = "__auto__";

/** Minimal variant fields from hls.js `Level` for matching without importing hls.js types in tests. */
export type HlsVariantProbe = Readonly<{
  height?: number;
  bitrate?: number;
  url?: string;
}>;

function isUsableQuality(q: MediaAvailableQuality): boolean {
  return (
    (typeof q.height === "number" && Number.isFinite(q.height)) ||
    (typeof q.path === "string" && q.path.length > 0) ||
    (typeof q.bandwidth === "number" && Number.isFinite(q.bandwidth))
  );
}

/** Stable `Select` value derived from playback JSON quality row. */
export function stableQualitySelectValue(q: MediaAvailableQuality): string {
  if (typeof q.height === "number" && Number.isFinite(q.height)) {
    return `h:${q.height}`;
  }
  if (typeof q.path === "string" && q.path.length > 0) {
    return `p:${q.path}`;
  }
  if (typeof q.bandwidth === "number" && Number.isFinite(q.bandwidth)) {
    return `b:${q.bandwidth}`;
  }
  return `l:${q.label ?? ""}`;
}

export function sortedQualitiesDesc(qualities: readonly MediaAvailableQuality[]): MediaAvailableQuality[] {
  return [...qualities].filter(isUsableQuality).sort((a, b) => {
    const ha = a.height ?? 0;
    const hb = b.height ?? 0;
    if (hb !== ha) return hb - ha;
    const ba = a.bandwidth ?? 0;
    const bb = b.bandwidth ?? 0;
    return bb - ba;
  });
}

export function findQualityBySelectValue(
  qualities: readonly MediaAvailableQuality[],
  value: string,
): MediaAvailableQuality | null {
  if (value === PATIENT_HLS_QUALITY_AUTO_VALUE) return null;
  for (const q of qualities) {
    if (!isUsableQuality(q)) continue;
    if (stableQualitySelectValue(q) === value) return q;
  }
  return null;
}

function normalizePathForMatch(path: string): string {
  return path.replace(/^\/+/, "").trim();
}

/**
 * Map playback quality row → hls.js level index (`hls.levels`).
 */
export function matchQualityToLevelIndex(
  levels: readonly HlsVariantProbe[],
  q: MediaAvailableQuality,
): number | null {
  if (!levels.length) return null;

  if (typeof q.height === "number" && Number.isFinite(q.height)) {
    const exact = levels.findIndex((l) => l.height === q.height);
    if (exact >= 0) return exact;
  }

  const pathNorm = typeof q.path === "string" ? normalizePathForMatch(q.path) : "";
  if (pathNorm.length > 0) {
    const byPath = levels.findIndex((l) => {
      const u = l.url ?? "";
      return u.includes(pathNorm) || u.endsWith(pathNorm);
    });
    if (byPath >= 0) return byPath;
  }

  if (typeof q.bandwidth === "number" && Number.isFinite(q.bandwidth)) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levels.length; i++) {
      const br = levels[i].bitrate;
      if (typeof br !== "number" || !Number.isFinite(br)) continue;
      const d = Math.abs(br - q.bandwidth);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= Math.max(500_000, q.bandwidth * 0.35)) {
      return bestIdx;
    }
  }

  if (typeof q.height === "number" && Number.isFinite(q.height)) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levels.length; i++) {
      const h = levels[i].height;
      if (typeof h !== "number" || !Number.isFinite(h)) continue;
      const d = Math.abs(h - q.height);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= 240) return bestIdx;
  }

  return null;
}

/** Label for the variant currently played (`LEVEL_SWITCHED` index). */
export function displayLabelForSwitchedLevel(
  levels: readonly HlsVariantProbe[],
  levelIndex: number,
  qualities: readonly MediaAvailableQuality[],
): string {
  const level = levels[levelIndex];
  if (!level) return "—";

  if (typeof level.height === "number" && Number.isFinite(level.height)) {
    const q = qualities.find((x) => x.height === level.height);
    if (q?.label && q.label.trim()) return q.label.trim();
    return `${level.height}p`;
  }

  const url = level.url ?? "";
  if (url.length > 0) {
    for (const q of qualities) {
      const p = q.path ? normalizePathForMatch(q.path) : "";
      if (p && url.includes(p) && q.label?.trim()) return q.label.trim();
    }
  }

  if (typeof level.bitrate === "number" && Number.isFinite(level.bitrate)) {
    let best: MediaAvailableQuality | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const q of qualities) {
      const bw = q.bandwidth;
      if (typeof bw !== "number" || !Number.isFinite(bw)) continue;
      const d = Math.abs(bw - level.bitrate);
      if (d < bestDist) {
        bestDist = d;
        best = q;
      }
    }
    if (best?.label?.trim() && bestDist <= Math.max(500_000, level.bitrate * 0.35)) {
      return best.label.trim();
    }
  }

  return "Авто";
}
