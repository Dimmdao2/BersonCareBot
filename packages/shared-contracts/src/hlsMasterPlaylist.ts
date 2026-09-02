export type MasterVariantEntry = {
  /** Path relative to master (e.g. `720p/index.m3u8`). */
  uri: string;
  bandwidth: number;
  width: number;
  height: number;
};

/** Build Apple-style multivariant VOD master playlist with relative variant URLs. */
export function buildVodMasterPlaylistBody(variants: MasterVariantEntry[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const variant of variants) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height},CODECS="avc1.64001f,mp4a.40.2"`,
    );
    lines.push(variant.uri);
  }
  return `${lines.join('\n')}\n`;
}

/** Non-comment, non-empty lines after headers are variant playlist relative URIs. */
export function parseMasterPlaylistVariantRelativeUris(masterBody: string): string[] {
  const uris: string[] = [];
  for (const line of masterBody.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    uris.push(trimmed);
  }
  return uris;
}
