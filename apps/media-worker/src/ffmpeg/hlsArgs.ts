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
    "-y",
    "-i",
    params.inputFile,
    "-vf",
    params.videoFilter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    params.videoBitrate,
    "-c:a",
    "aac",
    "-b:a",
    params.audioBitrate,
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    params.segmentFilename,
    params.outputM3u8,
  ];
}

export function buildPosterFfmpegArgs(inputFile: string, outputJpg: string, videoFilter?: string): string[] {
  const a = ["-y", "-ss", "1", "-i", inputFile];
  if (videoFilter) {
    a.push("-vf", videoFilter);
  }
  a.push("-vframes", "1", "-q:v", "2", outputJpg);
  return a;
}
