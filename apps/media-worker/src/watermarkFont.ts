import { existsSync } from "node:fs";

/**
 * TrueType font for drawtext. Ops can set `MEDIA_WORKER_WATERMARK_FONT` (bootstrap, not app integration config).
 * Tries common Linux font packages when unset.
 */
export function resolveWatermarkFontPath(log?: { warn: (o: Record<string, unknown>, m: string) => void }): string | null {
  const fromEnv = process.env.MEDIA_WORKER_WATERMARK_FONT?.trim();
  const candidates = [
    fromEnv,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
  ].filter((x): x is string => Boolean(x));

  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  log?.warn(
    { checked: candidates },
    "watermark_font_not_found: install fonts-dejavu-core or set MEDIA_WORKER_WATERMARK_FONT",
  );
  return null;
}
