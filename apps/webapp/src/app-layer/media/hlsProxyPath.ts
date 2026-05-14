import { posix } from "node:path";

export type NormalizeHlsPathResult =
  | { ok: true; segments: string[] }
  | { ok: false; reason: "empty" | "unsafe_segment" };

export function normalizeHlsUrlPathSegments(raw: string[] | undefined): NormalizeHlsPathResult {
  if (!raw || raw.length === 0) return { ok: false, reason: "empty" };
  const segments: string[] = [];
  for (const seg of raw) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return { ok: false, reason: "unsafe_segment" };
    }
    if (decoded === "" || decoded === "." || decoded === "..") return { ok: false, reason: "unsafe_segment" };
    if (decoded.includes("/") || decoded.includes("\\")) return { ok: false, reason: "unsafe_segment" };
    segments.push(decoded);
  }
  return { ok: true, segments };
}

export function hlsArtifactObjectKey(mediaId: string, segments: string[]): string {
  return posix.join("media", mediaId, "hls", ...segments);
}

export function isHlsPlaylistPath(segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? "";
  return last.toLowerCase().endsWith(".m3u8");
}

export function hlsArtifactSupportsHttpRange(segments: string[]): boolean {
  const last = segments[segments.length - 1] ?? "";
  return /\.(ts|m4s|aac|mp4|vtt)$/i.test(last);
}

export function inferHlsArtifactKind(segments: string[]): "master" | "variant" | "segment" {
  const joined = segments.join("/");
  if (joined.toLowerCase().endsWith("master.m3u8")) return "master";
  if (joined.toLowerCase().endsWith(".m3u8")) return "variant";
  return "segment";
}
