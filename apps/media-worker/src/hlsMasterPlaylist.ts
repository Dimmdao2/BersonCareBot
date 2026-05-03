/**
 * Build Apple-style multivariant VOD master playlist (relative variant URLs).
 * Keep in sync with `apps/webapp/src/shared/lib/hlsMasterPlaylist.ts` (verified in CI: `pnpm run check:hls-helpers-sync`).
 */
export type MasterVariantEntry = {
  /** Path relative to master (e.g. `720p/index.m3u8`). */
  uri: string;
  bandwidth: number;
  width: number;
  height: number;
};

export function buildVodMasterPlaylistBody(variants: MasterVariantEntry[]): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const v of variants) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height},CODECS="avc1.64001f,mp4a.40.2"`,
    );
    lines.push(v.uri);
  }
  return `${lines.join("\n")}\n`;
}

/** Smoke: non-comment, non-empty lines after headers = variant playlist relative URIs. */
export function parseMasterPlaylistVariantRelativeUris(masterBody: string): string[] {
  const out: string[] = [];
  for (const line of masterBody.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length === 0) continue;
    if (t.startsWith("#")) continue;
    out.push(t);
  }
  return out;
}
