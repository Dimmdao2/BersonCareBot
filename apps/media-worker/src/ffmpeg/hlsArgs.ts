/** Single-rendition VOD HLS; run with `cwd` = variant directory (e.g. `…/hls/720p`). */
export function buildHlsSingleVariantArgs(params: {
  inputFile: string;
  outputM3u8: string;
  segmentFilename: string;
  videoFilter: string;
  videoBitrate: string;
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
    '-b:v',
    params.videoBitrate,
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

/**
 * `protocolWhitelist` ставится ПЕРЕД `-i` и потому ограничивает только вход.
 *
 * Зачем: контейнер — это данные, которые прислал кто-то снаружи, и внутри него может лежать
 * ссылка на чужой адрес (плейлист, `concat`, внешняя дорожка). Без белого списка ffmpeg сходит по
 * такой ссылке сам. У превью вход всегда локальный файл, поэтому там список — ровно `file`.
 */
export function buildPosterFfmpegArgs(
  inputFile: string,
  outputJpg: string,
  videoFilter?: string,
  seekSeconds = 1,
  protocolWhitelist?: string,
): string[] {
  const a = ['-y'];
  if (protocolWhitelist) {
    a.push('-protocol_whitelist', protocolWhitelist);
  }
  a.push('-ss', String(seekSeconds), '-i', inputFile);
  if (videoFilter) {
    a.push('-vf', videoFilter);
  }
  a.push('-vframes', '1', '-q:v', '2', outputJpg);
  return a;
}
