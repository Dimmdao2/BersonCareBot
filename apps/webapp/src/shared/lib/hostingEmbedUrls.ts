/**
 * Преобразование публичных URL видеохостингов в безопасные iframe-src (allowlist доменов).
 */

export function toYoutubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        const normalized = new URL(u.href);
        normalized.protocol = "https:";
        return normalized.toString();
      }
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
      }
      const shortsMatch = /^\/shorts\/([^/?]+)/.exec(u.pathname);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/embed/${encodeURIComponent(shortsMatch[1])}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Канонический embed RuTube + сохранение query (напр. `p` для приватных роликов). */
export function toRutubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "rutube.ru") return null;

    let videoId: string | null = null;

    const embedMatch = /^\/play\/embed\/([^/?]+)/.exec(u.pathname);
    if (embedMatch?.[1]) {
      videoId = embedMatch[1];
      const out = new URL(`https://rutube.ru/play/embed/${videoId}`);
      u.searchParams.forEach((value, key) => {
        out.searchParams.set(key, value);
      });
      return out.toString();
    }

    const videoMatch = /^\/video\/([^/?]+)/.exec(u.pathname);
    if (videoMatch?.[1]) videoId = videoMatch[1];

    const shortsMatch = /^\/shorts\/([^/?]+)/.exec(u.pathname);
    if (!videoId && shortsMatch?.[1]) videoId = shortsMatch[1];

    if (!videoId) return null;

    const out = new URL(`https://rutube.ru/play/embed/${videoId}`);
    u.searchParams.forEach((value, key) => {
      out.searchParams.set(key, value);
    });
    return out.toString();
  } catch {
    return null;
  }
}

export function toYoutubeOrRutubeEmbedSrc(url: string): string | null {
  return toYoutubeEmbedSrc(url) ?? toRutubeEmbedSrc(url);
}
