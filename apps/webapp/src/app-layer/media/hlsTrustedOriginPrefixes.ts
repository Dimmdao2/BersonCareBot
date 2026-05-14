import { env } from "@/config/env";

/**
 * Trusted absolute URL prefixes for objects in `S3_PRIVATE_BUCKET` (path-style + virtual-hosted).
 * Used to rewrite absolute URIs inside playlists to same-origin `/api/media/{id}/hls/...`.
 */
export function buildTrustedPrivateObjectUrlPrefixes(): string[] {
  const endpoint = (env.S3_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const bucket = (env.S3_PRIVATE_BUCKET ?? "").trim();
  if (!endpoint || !bucket) return [];
  const out: string[] = [`${endpoint}/${bucket}/`];
  try {
    const u = new URL(endpoint);
    out.push(`${u.protocol}//${bucket}.${u.host}/`);
  } catch {
    /* ignore malformed endpoint */
  }
  return [...new Set(out)];
}
