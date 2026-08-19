export const VIDEO_DURATION_BUCKETS = [
  'le3',
  'm3_5',
  'm5_7',
  'm7_10',
  'm10_15',
  'm15_20',
  'over20',
  'unknown',
] as const;

export type VideoDurationBucket = (typeof VIDEO_DURATION_BUCKETS)[number];

/** Ступени: до 3 / 3–5 / 5–7 / 7–10 / 10–15 / 15–20 минут, плюс длиннее и без длительности. */
export function videoDurationBucket(seconds: number | null | undefined): VideoDurationBucket {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds <= 3 * 60) return 'le3';
  if (seconds <= 5 * 60) return 'm3_5';
  if (seconds <= 7 * 60) return 'm5_7';
  if (seconds <= 10 * 60) return 'm7_10';
  if (seconds <= 15 * 60) return 'm10_15';
  if (seconds <= 20 * 60) return 'm15_20';
  return 'over20';
}

export function emptyDurationBucketCounts(): Record<VideoDurationBucket, number> {
  return {
    le3: 0,
    m3_5: 0,
    m5_7: 0,
    m7_10: 0,
    m10_15: 0,
    m15_20: 0,
    over20: 0,
    unknown: 0,
  };
}
