import { ffprobePathFromFfmpeg, runProbe } from './runProbe.js';

export type VideoDimensions = { width: number; height: number };

/**
 * Dimensions plus best-effort overall source bitrate. `bitrateBps` is the whole-container bitrate
 * (ffprobe `format.bit_rate` — includes audio and container overhead, not a pure video-stream figure)
 * because that is what both ffprobe and the `ffmpeg -i` banner reliably report across containers; the
 * video-only stream `bit_rate` is frequently absent for `.mov`/`.mp4` sources (most of the library —
 * see `VIDEO_DELIVERY_COST_AND_METERING`). `null` when the container doesn't report it — never invented.
 */
export type VideoSourceProbe = VideoDimensions & { bitrateBps: number | null };

function parsePositiveDimensions(rawWidth: unknown, rawHeight: unknown): VideoDimensions | null {
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width: Math.trunc(width), height: Math.trunc(height) };
}

function parsePositiveBitrateBps(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/**
 * Pure parse of ffprobe's combined JSON output — one call asking for `stream=width,height` (video
 * stream) AND `format=bit_rate` (whole-file bitrate) at once, e.g.:
 * `{"streams":[{"width":1920,"height":1080}],"format":{"bit_rate":"10739200"}}`.
 * One call, one parse, both facts — no second pass over the file for the bitrate.
 */
export function parseFfprobeSourceProbeJson(raw: string): VideoSourceProbe | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const streams = (data as { streams?: unknown }).streams;
  const stream = Array.isArray(streams) ? (streams[0] as Record<string, unknown> | undefined) : undefined;
  if (!stream) return null;
  const dims = parsePositiveDimensions(stream.width, stream.height);
  if (!dims) return null;
  const format = (data as { format?: unknown }).format;
  const bitRate =
    typeof format === 'object' && format !== null
      ? (format as Record<string, unknown>).bit_rate
      : undefined;
  return { ...dims, bitrateBps: parsePositiveBitrateBps(bitRate) };
}

const FFMPEG_STDERR_DIMENSIONS_RE = /Video:.*?[, ](\d{2,5})x(\d{2,5})(?:[, ]|$)/;
const FFMPEG_STDERR_BITRATE_RE = /bitrate:\s*(\d+(?:\.\d+)?)\s*kb\/s/i;

/**
 * Pure parse of the `ffmpeg -i` stderr banner fallback — resolution off the `Stream … Video:` line,
 * overall bitrate off the same banner's `Duration: …, bitrate: N kb/s` line. Same single stderr blob
 * already captured by the one `ffmpeg -i` fallback invocation; not a second probe of the file.
 */
export function parseFfmpegStderrSourceProbe(stderr: string): VideoSourceProbe | null {
  const dimsMatch = FFMPEG_STDERR_DIMENSIONS_RE.exec(stderr);
  if (!dimsMatch) return null;
  const dims = parsePositiveDimensions(dimsMatch[1], dimsMatch[2]);
  if (!dims) return null;
  const bitrateMatch = FFMPEG_STDERR_BITRATE_RE.exec(stderr);
  const bitrateBps = bitrateMatch
    ? parsePositiveBitrateBps(Number.parseFloat(bitrateMatch[1]!) * 1000)
    : null;
  return { ...dims, bitrateBps };
}

/**
 * Best-effort source frame size + bitrate (ffprobe, then `ffmpeg -i` fallback) — used once per job.
 * Dimensions decide which ladder rungs fit the source (§«Never build a rung whose height exceeds the
 * source height»); bitrate caps each rung's CRF ceiling (§«потолок ступени никогда не выше битрейта
 * исходника»). Both facts come out of the SAME probe call in both the primary (ffprobe JSON) and
 * fallback (`ffmpeg -i` stderr) path — never a second pass over the file to get the bitrate.
 */
export async function probeVideoDimensions(
  ffmpegBin: string,
  inputPath: string,
  timeoutMs = 60_000,
): Promise<VideoSourceProbe | null> {
  const ffprobeBin = ffprobePathFromFfmpeg(ffmpegBin);
  try {
    const ffprobe = await runProbe(
      ffprobeBin,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=bit_rate',
        '-of',
        'json',
        inputPath,
      ],
      timeoutMs,
    );
    if (ffprobe.code === 0) {
      const probe = parseFfprobeSourceProbeJson(ffprobe.stdout);
      if (probe) return probe;
    }
  } catch {
    /* ffprobe missing or failed — try ffmpeg */
  }

  try {
    const ffmpeg = await runProbe(
      ffmpegBin,
      ['-hide_banner', '-i', inputPath, '-f', 'null', '-'],
      timeoutMs,
    );
    return parseFfmpegStderrSourceProbe(ffmpeg.stderr);
  } catch {
    return null;
  }
}
