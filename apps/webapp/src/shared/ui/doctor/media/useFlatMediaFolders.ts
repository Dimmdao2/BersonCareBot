"use client";

import { useEffect, useState } from "react";
import type { MediaFolderRecord } from "@/modules/media/types";

/**
 * Плоский список папок медиатеки (`/api/admin/media/folders?flat=true`).
 * Запрос только пока `active` — например, пока открыта модалка или экран библиотеки.
 */
export function useFlatMediaFolders(active: boolean): {
  folders: MediaFolderRecord[];
  foldersLoaded: boolean;
} {
  const [folders, setFolders] = useState<MediaFolderRecord[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => {
        setFolders([]);
        setFoldersLoaded(false);
      });
      return;
    }
    const ac = new AbortController();
    queueMicrotask(() => setFoldersLoaded(false));
    fetch("/api/admin/media/folders?flat=true", { credentials: "same-origin", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaFolderRecord[] };
        if (!res.ok || !data.ok) throw new Error("folders_failed");
        return data.items ?? [];
      })
      .then((list) => {
        if (ac.signal.aborted) return;
        setFolders(list);
        setFoldersLoaded(true);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setFolders([]);
        setFoldersLoaded(true);
      });
    return () => ac.abort();
  }, [active]);

  return { folders, foldersLoaded };
}
