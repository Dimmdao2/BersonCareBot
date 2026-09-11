const EXTINF_RE = /^#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)\s*,/;

/**
 * Sums `#EXTINF` segment durations from a produced HLS variant playlist. This is the recorded
 * clip duration (`media_files.video_duration_seconds`): the source file may already be deleted by
 * the time duration is (re)computed, but a produced variant playlist always exists once HLS is
 * `ready`.
 */
export function sumHlsExtinfDurationSeconds(variantPlaylistBody: string): number | null {
  let total = 0;
  let found = false;
  for (const line of variantPlaylistBody.split(/\r?\n/)) {
    const m = EXTINF_RE.exec(line.trim());
    if (!m) continue;
    const seconds = Number.parseFloat(m[1]!);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    total += seconds;
    found = true;
  }
  if (!found || total <= 0) return null;
  return total;
}

/**
 * Первый сегмент варианта — по нему измеряется фактический размер кадра для манифеста. Разбор
 * плейлиста живёт здесь же, рядом с разбором длительности, чтобы не появилось второго парсера.
 * `#EXT-X-MAP:URI="init.mp4"` (fMP4-вариант) начинается с `#` и отсеивается тем же условием, что и
 * остальные теги — вторая ветка для него не нужна.
 */
export function firstHlsSegmentName(variantPlaylistBody: string): string | null {
  for (const raw of variantPlaylistBody.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.includes('/') || line.includes('\\') || line.includes(':')) continue;
    return line;
  }
  return null;
}

const EXT_X_MAP_URI_RE = /^#EXT-X-MAP:.*URI="([^"]+)"/;

/**
 * URI init-сегмента fMP4-варианта из тега `#EXT-X-MAP`. Фрагмент (`.m4s`) сам — это только
 * `moof`+`mdat`, без `ftyp`+`moov` из init-сегмента, и без него не декодируется в одиночку
 * (капкан пробы размеров, см. `processTranscodeJob.ts`). `null` для варианта без этого тега.
 */
export function hlsMapUriFromVariantPlaylist(variantPlaylistBody: string): string | null {
  for (const raw of variantPlaylistBody.split(/\r?\n/)) {
    const m = EXT_X_MAP_URI_RE.exec(raw.trim());
    if (m) return m[1] ?? null;
  }
  return null;
}
