/**
 * CRF value for every rung (owner decision 2026-09-11, `VIDEO_DELIVERY_COST_AND_METERING` — "то, что
 * делает Netflix, не будем... фиксированный битрейт меняем на CRF с потолком"). A ceiling, not a
 * target: simple content (static camera, one person, flat wall) settles below it on its own; complex
 * content is capped by `-maxrate` instead of dragged up to it the way plain `-b:v` ABR would.
 */
export const HLS_ENCODE_CRF = 23;

/** Single-rendition VOD HLS; run with `cwd` = variant directory (e.g. `…/hls/720p`). */
export function buildHlsSingleVariantArgs(params: {
  inputFile: string;
  outputM3u8: string;
  segmentFilename: string;
  videoFilter: string;
  /** Ceiling in bits/sec — becomes `-maxrate`; `-bufsize` is 2× this. Never the CRF target itself. */
  videoBitrateCeilingBps: number;
  audioBitrate: string;
}): string[] {
  return [
    '-y',
    '-i',
    params.inputFile,
    '-vf',
    params.videoFilter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(HLS_ENCODE_CRF),
    '-maxrate',
    String(params.videoBitrateCeilingBps),
    '-bufsize',
    String(params.videoBitrateCeilingBps * 2),
    '-c:a',
    'aac',
    '-b:a',
    params.audioBitrate,
    '-f',
    'hls',
    '-hls_time',
    '6',
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_filename',
    params.segmentFilename,
    params.outputM3u8,
  ];
}

export function buildPosterFfmpegArgs(
  inputFile: string,
  outputJpg: string,
  videoFilter?: string,
  seekSeconds = 1,
): string[] {
  const a = ['-y', '-ss', String(seekSeconds), '-i', inputFile];
  if (videoFilter) {
    a.push('-vf', videoFilter);
  }
  a.push('-vframes', '1', '-q:v', '2', outputJpg);
  return a;
}
