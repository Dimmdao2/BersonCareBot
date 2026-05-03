/**
 * Non-PII watermark for HLS renditions: readable label + media UUID only (phase-10 policy).
 * FFmpeg drawtext uses textfile to avoid escaping issues with UUID characters.
 */
export type WatermarkDrawtextParams = {
  /** UTF-8 text file path (POSIX, forward slashes for ffmpeg filter). */
  textFilePosix: string;
  /** TrueType font path (POSIX). */
  fontfilePosix: string;
};

/** Appended after scale/format filters; includes comma prefix for chaining. */
export function buildDrawtextWatermarkSuffix(params: WatermarkDrawtextParams): string {
  const tf = posixSlash(params.textFilePosix);
  const ff = posixSlash(params.fontfilePosix);
  // ffmpeg drawtext filter grammar — high symbol entropy triggers false positive in secret scanners
  /* eslint-disable-next-line no-secrets/no-secrets -- ffmpeg filter syntax */
  return `,drawtext=fontfile=${ff}:textfile=${tf}:fontsize=16:fontcolor=white@0.5:box=1:boxcolor=black@0.45:boxborderw=4:x=w-tw-12:y=h-th-12`;
}

function posixSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Plain-ASCII line for watermark file (UUID + label only — no PII). */
export function watermarkTextLine(mediaId: string): string {
  return `id ${mediaId}\n`;
}

export function composeHlsVideoFilter(baseScaleFilter: string, watermark: WatermarkDrawtextParams | null): string {
  if (!watermark) return baseScaleFilter;
  return `${baseScaleFilter}${buildDrawtextWatermarkSuffix(watermark)}`;
}
