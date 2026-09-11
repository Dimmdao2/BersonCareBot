import { ffprobePathFromFfmpeg, runProbe } from './runProbe.js';

export type VideoDimensions = { width: number; height: number };

const FFMPEG_STDERR_DIMENSIONS_RE = /Video:.*?[, ](\d{2,5})x(\d{2,5})(?:[, ]|$)/;

function parsePositiveDimensions(rawWidth: string, rawHeight: string): VideoDimensions | null {
  const width = Number.parseInt(rawWidth, 10);
  const height = Number.parseInt(rawHeight, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Pure parse of ffprobe `-of csv=s=x:p=0` stream output, e.g. `1920x1080`. */
export function parseFfprobeDimensionsCsv(raw: string): VideoDimensions | null {
  const line = raw.trim().split('\n')[0]?.trim() ?? '';
  const [w, h] = line.split('x');
  if (!w || !h) return null;
  return parsePositiveDimensions(w, h);
}

/** Pure parse of `ffmpeg -i` stderr banner, e.g. `Stream #0:0: Video: h264 …, 1280x720 [SAR …`. */
export function parseFfmpegStderrDimensions(stderr: string): VideoDimensions | null {
  const m = FFMPEG_STDERR_DIMENSIONS_RE.exec(stderr);
  if (!m) return null;
  return parsePositiveDimensions(m[1]!, m[2]!);
}

/**
 * Best-effort source frame size (ffprobe, then `ffmpeg -i` fallback) — used once per job to derive
 * which ladder rungs fit the source (§«Never build a rung whose height exceeds the source height»).
 */
export async function probeVideoDimensions(
  ffmpegBin: string,
  inputPath: string,
  timeoutMs = 60_000,
): Promise<VideoDimensions | null> {
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
        'stream=width,height',
        '-of',
        'csv=s=x:p=0',
        inputPath,
      ],
      timeoutMs,
    );
    if (ffprobe.code === 0) {
      const dims = parseFfprobeDimensionsCsv(ffprobe.stdout);
      if (dims) return dims;
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
    return parseFfmpegStderrDimensions(ffmpeg.stderr);
  } catch {
    return null;
  }
}
