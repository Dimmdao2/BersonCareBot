import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

function adminMediaItemUrl(mediaId: string): string {
  const path = `/api/admin/media/${encodeURIComponent(mediaId)}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return new URL(path, "http://localhost").toString();
}

/** GET /api/admin/media/[id] — same row shape as list `items[]`. */
export async function fetchAdminMediaListItem(
  mediaId: string,
  init?: RequestInit,
): Promise<MediaListItem | null> {
  try {
    const res = await fetch(adminMediaItemUrl(mediaId), {
      credentials: "same-origin",
      ...init,
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; item?: MediaListItem } | null;
    if (!res.ok || !data?.ok || !data.item) return null;
    return data.item;
  } catch {
    return null;
  }
}
