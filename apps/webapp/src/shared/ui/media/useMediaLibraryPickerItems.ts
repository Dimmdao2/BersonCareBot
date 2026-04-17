"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import {
  getMediaLibraryPickerListCached,
  invalidateMediaLibraryPickerListCache,
  setMediaLibraryPickerListCached,
} from "@/shared/ui/media/mediaLibraryPickerListCache";

/** Max items per picker list request (API cap). */
export const MEDIA_LIBRARY_PICKER_LIST_LIMIT = 200;

export type AdminMediaListUrlSortBy = "date" | "size" | "type" | "name";

export function buildAdminMediaListUrl(args: {
  apiKind: string;
  folderId?: string | null;
  sortBy?: AdminMediaListUrlSortBy;
  sortDir?: "asc" | "desc";
}): string {
  const p = new URLSearchParams();
  p.set("kind", args.apiKind);
  p.set("sortBy", args.sortBy ?? "date");
  p.set("sortDir", args.sortDir ?? "desc");
  p.set("limit", String(MEDIA_LIBRARY_PICKER_LIST_LIMIT));
  if (args.folderId !== undefined) {
    if (args.folderId === null) p.set("folderId", "root");
    else p.set("folderId", args.folderId);
  }
  return `/api/admin/media?${p.toString()}`;
}

export type MediaLibraryPickerKindFilter = "image" | "video" | "image_or_video" | "all";

/**
 * After server list: for `image_or_video` the API uses `kind=all`, so narrow to image|video in UI.
 */
export function narrowMediaLibraryPickerItemsByKind(
  items: MediaListItem[],
  kind: MediaLibraryPickerKindFilter,
): MediaListItem[] {
  if (kind === "image_or_video") {
    return items.filter((i) => i.kind === "image" || i.kind === "video");
  }
  return items;
}

/**
 * Local picker search over preloaded rows (`displayName` + `filename`).
 */
export function filterMediaLibraryPickerItemsByQuery(items: MediaListItem[], query: string): MediaListItem[] {
  const needle = normalizeRuSearchString(query.trim());
  if (!needle) return items;
  return items.filter((item) => {
    const filename = normalizeRuSearchString(item.filename);
    const displayName = item.displayName ? normalizeRuSearchString(item.displayName) : "";
    return filename.includes(needle) || displayName.includes(needle);
  });
}

/**
 * Загрузка списка при открытой модалке.
 * При `open: false` не сбрасывает последний успешный список (удобно при повторном открытии).
 * Кэш по полному `listUrl`: при повторном открытии с тем же URL список берётся из памяти без повторного fetch,
 * пока запись не инвалидирована (`invalidateMediaLibraryPickerListCache`) или не изменился `reloadKey`.
 * Превью JPEG по URL остаются в браузерном HTTP-кэше благодаря `Cache-Control` на `/api/media/.../preview/*`.
 * Защита от stale response: монотонный requestId + AbortController.
 */
export function useMediaLibraryPickerItems(options: {
  open: boolean;
  listUrl: string;
  /** Increment (e.g. after upload) to bypass cache for the current `listUrl`. */
  reloadKey?: number;
}): {
  items: MediaListItem[];
  loading: boolean;
  error: string | null;
} {
  const { open, listUrl, reloadKey = 0 } = options;
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(0);
  const prevReloadKeyRef = useRef(reloadKey);

  const loading = open && inFlight;

  useEffect(() => {
    if (!open) {
      latestRequestRef.current += 1;
      return;
    }

    const reloadBumped = prevReloadKeyRef.current !== reloadKey;
    prevReloadKeyRef.current = reloadKey;

    if (!reloadBumped) {
      const cached = getMediaLibraryPickerListCached(listUrl);
      if (cached !== undefined) {
        queueMicrotask(() => {
          setItems(cached);
          setError(null);
          setInFlight(false);
        });
        return;
      }
    } else {
      invalidateMediaLibraryPickerListCache(listUrl);
    }

    const requestId = ++latestRequestRef.current;
    const ac = new AbortController();

    queueMicrotask(() => {
      setInFlight(true);
      setError(null);
    });

    fetch(listUrl, { credentials: "same-origin", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaListItem[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
        return data.items ?? [];
      })
      .then((next) => {
        if (ac.signal.aborted || requestId !== latestRequestRef.current) return;
        setMediaLibraryPickerListCached(listUrl, next);
        setItems(next);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name === "AbortError") return;
        if (requestId !== latestRequestRef.current) return;
        setError("Не удалось загрузить библиотеку");
      })
      .finally(() => {
        if (requestId !== latestRequestRef.current) return;
        setInFlight(false);
      });

    return () => {
      ac.abort();
    };
  }, [open, listUrl, reloadKey]);

  return { items, loading, error };
}

export { invalidateMediaLibraryPickerListCache } from "@/shared/ui/media/mediaLibraryPickerListCache";
