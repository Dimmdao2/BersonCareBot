/**
 * Rewrite absolute URLs pointing at trusted private-bucket origins to `/api/media/{mediaId}/hls/...`.
 */

export function rewriteAbsoluteUriToProxy(uri: string, mediaId: string, trustedPrefixes: string[]): string | null {
  const stripped = uri.trim();
  if (!stripped.startsWith("http://") && !stripped.startsWith("https://")) {
    return null;
  }

  let originAndPath: string;
  try {
    const u = new URL(stripped);
    const decodedPath = decodeURIComponent(u.pathname);
    originAndPath = `${u.origin}${decodedPath}`;
  } catch {
    return null;
  }

  const expected = `media/${mediaId}/hls/`;

  for (const prefix of trustedPrefixes) {
    let prefixComparable = prefix;
    try {
      const pu = new URL(prefix);
      prefixComparable = `${pu.origin}${decodeURIComponent(pu.pathname)}`;
    } catch {
      /* prefix may still match when endpoint isn't URL-shaped */
    }
    if (originAndPath.startsWith(prefixComparable)) {
      const keyRest = originAndPath.slice(prefixComparable.length);
      if (!keyRest.startsWith(expected)) return null;
      const relative = keyRest.slice(expected.length);
      return `/api/media/${mediaId}/hls/${relative}`;
    }
  }
  return null;
}

export function rewriteM3u8AbsoluteUrls(body: string, mediaId: string, trustedPrefixes: string[]): string {
  const lines = body.split(/\r?\n/);
  const out = lines.map((line) => rewriteM3u8Line(line, mediaId, trustedPrefixes));
  return out.join("\n");
}

function rewriteM3u8Line(line: string, mediaId: string, trustedPrefixes: string[]): string {
  const trimmedRight = line.replace(/\s+$/, "");
  if (/^#EXT-X-MAP:/i.test(trimmedRight) || /^#EXT-X-KEY:/i.test(trimmedRight)) {
    return rewriteQuotedUriAttributes(line, mediaId, trustedPrefixes);
  }
  if (trimmedRight.startsWith("#") || trimmedRight === "") return line;

  const rewritten = rewriteAbsoluteUriToProxy(trimmedRight, mediaId, trustedPrefixes);
  if (!rewritten) return line;
  const trailing = line.slice(trimmedRight.length);
  return `${rewritten}${trailing}`;
}

function rewriteQuotedUriAttributes(line: string, mediaId: string, trustedPrefixes: string[]): string {
  let out = line.replace(/URI="([^"]+)"/gi, (full, uri: string) => {
    const next = rewriteAbsoluteUriToProxy(uri, mediaId, trustedPrefixes);
    return next ? `URI="${next}"` : full;
  });
  /** Unquoted absolute URI before next comma/whitespace (e.g. METHOD=AES-128,URI=https://...) */
  out = out.replace(/\bURI=(https?:\/\/[^\s,"]+)/gi, (full, uri: string) => {
    const next = rewriteAbsoluteUriToProxy(uri, mediaId, trustedPrefixes);
    return next ? `URI="${next}"` : full;
  });
  return out;
}
