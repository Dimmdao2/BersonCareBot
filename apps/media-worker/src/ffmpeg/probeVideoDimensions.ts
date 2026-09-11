import { ffprobePathFromFfmpeg, runProbe } from './runProbe.js';

export type VideoDimensions = { width: number; height: number };

/**
 * Dimensions plus best-effort source bitrates. Three separate facts, because a rung's ceiling and a
 * rung's audio are two different decisions:
 *
 * - `bitrateBps` — whole container (`format.bit_rate`): what gets stored as «битрейт исходника».
 * - `videoBitrateBps` — the video stream alone: the only honest ceiling for `-maxrate`. Замер живой
 *   библиотеки владельца 11.09.2026 (151 ролик, ffprobe по каждому): битрейт видеопотока отдают 148
 *   из 151, а контейнер больше видеопотока в среднем на 110 кбит/с — то есть контейнерное число
 *   завышало бы потолок ровно на звук и накладные.
 * - `audioBitrateBps` — the source audio stream: без него звук переписывается ВВЕРХ. В той же
 *   библиотеке медиана звука 105 кбит/с, и 139 роликов из 148 тише плановых 128k двух верхних
 *   ступеней — то есть «экономия» на видео частично съедалась раздутым звуком.
 *
 * `null` в любом поле значит «источник не сообщил» — число не выдумываем, поведение не меняем.
 */
export type VideoSourceProbe = VideoDimensions & {
  bitrateBps: number | null;
  videoBitrateBps: number | null;
  audioBitrateBps: number | null;
};

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
 * Pure parse of ffprobe's combined JSON output — ОДИН вызов на все факты:
 * `{"streams":[{"codec_type":"video","width":1920,"height":1080,"bit_rate":"10600000"},
 *   {"codec_type":"audio","bit_rate":"64860"}],"format":{"bit_rate":"10739200"}}`.
 * Первый видеопоток даёт кадр и потолок, первый звуковой — потолок звука, контейнер — то, что
 * хранится в БД. Второго прохода по файлу нет.
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
  const list: Record<string, unknown>[] = Array.isArray(streams)
    ? (streams.filter((s) => typeof s === 'object' && s !== null) as Record<string, unknown>[])
    : [];
  // Видеопоток узнаём по `codec_type`, а при его отсутствии в выводе — по наличию размеров кадра:
  // прежний вызов ограничивался `-select_streams v:0` и отдавал поток без `codec_type`.
  const video =
    list.find((s) => s.codec_type === 'video') ??
    list.find((s) => s.width !== undefined && s.height !== undefined);
  if (!video) return null;
  const dims = parsePositiveDimensions(video.width, video.height);
  if (!dims) return null;
  const audio = list.find((s) => s.codec_type === 'audio');
  const format = (data as { format?: unknown }).format;
  const containerBitRate =
    typeof format === 'object' && format !== null
      ? (format as Record<string, unknown>).bit_rate
      : undefined;
  return {
    ...dims,
    bitrateBps: parsePositiveBitrateBps(containerBitRate),
    videoBitrateBps: parsePositiveBitrateBps(video.bit_rate),
    audioBitrateBps: audio ? parsePositiveBitrateBps(audio.bit_rate) : null,
  };
}

const FFMPEG_STDERR_DIMENSIONS_RE = /Video:.*?[, ](\d{2,5})x(\d{2,5})(?:[, ]|$)/;
const FFMPEG_STDERR_BITRATE_RE = /bitrate:\s*(\d+(?:\.\d+)?)\s*kb\/s/i;
const FFMPEG_STDERR_VIDEO_BITRATE_RE = /Video:[^\n]*?,\s*(\d+(?:\.\d+)?)\s*kb\/s/i;
const FFMPEG_STDERR_AUDIO_BITRATE_RE = /Audio:[^\n]*?,\s*(\d+(?:\.\d+)?)\s*kb\/s/i;

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
  const kbps = (re: RegExp): number | null => {
    const m = re.exec(stderr);
    return m ? parsePositiveBitrateBps(Number.parseFloat(m[1]!) * 1000) : null;
  };
  return {
    ...dims,
    bitrateBps: kbps(FFMPEG_STDERR_BITRATE_RE),
    videoBitrateBps: kbps(FFMPEG_STDERR_VIDEO_BITRATE_RE),
    audioBitrateBps: kbps(FFMPEG_STDERR_AUDIO_BITRATE_RE),
  };
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
        '-show_entries',
        'stream=codec_type,width,height,bit_rate:format=bit_rate',
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
