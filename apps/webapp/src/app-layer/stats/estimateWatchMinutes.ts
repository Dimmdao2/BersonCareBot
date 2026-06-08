/** Conservative per-playback estimate when `media_files.video_duration_seconds` is missing. */
export const ESTIMATED_PLAYBACK_SECONDS_WHEN_DURATION_UNKNOWN = 120;

/**
 * Rounds summed duration seconds to minutes; if zero but events exist, estimates from avg or default per event.
 */
export function estimateWatchMinutes(params: {
  totalSeconds: number;
  eventCount: number;
  avgSecondsFallback: number;
  defaultSecondsPerEvent?: number;
}): number {
  const fromDuration = Math.round(Math.max(0, params.totalSeconds) / 60);
  if (fromDuration > 0) return fromDuration;
  if (params.eventCount <= 0) return 0;
  const perEvent =
    params.avgSecondsFallback > 0
      ? params.avgSecondsFallback
      : (params.defaultSecondsPerEvent ?? ESTIMATED_PLAYBACK_SECONDS_WHEN_DURATION_UNKNOWN);
  return Math.round((params.eventCount * perEvent) / 60);
}
