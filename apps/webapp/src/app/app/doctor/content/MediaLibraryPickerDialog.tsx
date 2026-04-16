"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import {
  buildAdminMediaListUrl,
  filterMediaLibraryPickerItemsByQuery,
  narrowMediaLibraryPickerItemsByKind,
  useMediaLibraryPickerItems,
} from "@/shared/ui/media/useMediaLibraryPickerItems";
import type { MediaExerciseUsageEntry, MediaFolderRecord } from "@/modules/media/types";
import { cn } from "@/lib/utils";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { fetchAdminMediaListItem } from "@/shared/ui/media/fetchAdminMediaListItem";
import { mediaLibraryPickerSelectionToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

export type MediaLibraryPickerKind = "image" | "video" | "image_or_video";

export type MediaLibraryPickMeta = Pick<MediaListItem, "kind" | "mimeType" | "filename" | "displayName">;

/** When `kind` is `image_or_video`, hints preview for bare `/api/media/:id` URLs after reload. */
export type MediaLibrarySelectedPreviewKind = "image" | "video" | "gif";

type LastPick = {
  url: string;
  rowKind: MediaListItem["kind"];
  mimeType: string;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaListItem["previewStatus"];
};

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

function inferPreviewFromUrl(url: string): "image" | "gif" | "video" | null {
  const u = url.trim().toLowerCase();
  if (!u) return null;
  if (u.includes(".gif") || /[./]gif(\?|$)/i.test(u)) return "gif";
  if (/\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i.test(u)) return "video";
  if (u.startsWith("/api/media/")) return "image";
  if (/^https?:\/\//i.test(u)) return "image";
  return null;
}

function resolveSelectedPreview(args: {
  value: string;
  kind: MediaLibraryPickerKind;
  previewKind?: MediaLibrarySelectedPreviewKind;
  lastPick: LastPick | null;
}): "image" | "gif" | "video" | null {
  const { value, kind, previewKind, lastPick } = args;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (lastPick && lastPick.url === trimmed) {
    if (lastPick.rowKind === "video") return "video";
    if (lastPick.rowKind === "image") {
      const mime = lastPick.mimeType.toLowerCase();
      if (mime === "image/gif" || /\.gif$/i.test(trimmed)) return "gif";
      return "image";
    }
    return null;
  }

  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "image_or_video") {
    if (previewKind === "video") return "video";
    if (previewKind === "gif" || previewKind === "image") return previewKind === "gif" ? "gif" : "image";
    return inferPreviewFromUrl(trimmed);
  }
  return null;
}

function folderPathLabel(folder: MediaFolderRecord, all: MediaFolderRecord[]): string {
  const byId = new Map(all.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur: MediaFolderRecord | undefined = folder;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

type MediaLibraryPickerOpenPanelProps = {
  open: boolean;
  listUrl: string;
  kind: MediaLibraryPickerKind;
  onPick: (item: MediaListItem) => void;
  exercisePicker: boolean;
  pickerFolderId: string | null | undefined;
  onPickerFolderIdChange: (next: string | null | undefined) => void;
};

/**
 * Состояние поиска и загрузка списка живут здесь, чтобы ввод в поле поиска
 * не ререндерил превью и кнопки снаружи модалки.
 */
function MediaLibraryPickerOpenPanel({
  open,
  listUrl,
  kind,
  onPick,
  exercisePicker,
  pickerFolderId,
  onPickerFolderIdChange,
}: MediaLibraryPickerOpenPanelProps) {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<MediaFolderRecord[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [exerciseUsageByMediaId, setExerciseUsageByMediaId] = useState<
    Record<string, MediaExerciseUsageEntry[]>
  >({});
  const [usageReady, setUsageReady] = useState(false);

  const { items, loading, error } = useMediaLibraryPickerItems({ open, listUrl });

  const usageRequestRef = useRef(0);

  useEffect(() => {
    if (!open || !exercisePicker) {
      queueMicrotask(() => {
        setFolders([]);
        setFoldersLoaded(false);
      });
      return;
    }
    const ac = new AbortController();
    queueMicrotask(() => {
      setFoldersLoaded(false);
    });
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
  }, [open, exercisePicker]);

  useEffect(() => {
    if (!open || !exercisePicker) {
      usageRequestRef.current += 1;
      queueMicrotask(() => {
        setExerciseUsageByMediaId({});
        setUsageReady(false);
      });
      return;
    }
    const ids = [...new Set(items.map((i) => i.id).filter(Boolean))];
    if (ids.length === 0) {
      queueMicrotask(() => {
        setExerciseUsageByMediaId({});
        setUsageReady(true);
      });
      return;
    }
    const requestId = ++usageRequestRef.current;
    const ac = new AbortController();
    queueMicrotask(() => {
      setUsageReady(false);
    });

    /** Не конкурировать с отрисовкой списка и fetch медиа: usage — вторичный, после кадра / idle. */
    const runUsageFetch = () => {
      if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
      fetch("/api/admin/media/exercise-usage", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        signal: ac.signal,
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            ok?: boolean;
            usage?: Record<string, MediaExerciseUsageEntry[]>;
            error?: string;
          };
          if (!res.ok || !data.ok) throw new Error(data.error ?? "usage_failed");
          return data.usage ?? {};
        })
        .then((raw) => {
          if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
          const normalized: Record<string, MediaExerciseUsageEntry[]> = {};
          for (const [k, v] of Object.entries(raw)) {
            normalized[k.toLowerCase()] = Array.isArray(v) ? v : [];
          }
          setExerciseUsageByMediaId(normalized);
          setUsageReady(true);
        })
        .catch(() => {
          if (ac.signal.aborted || requestId !== usageRequestRef.current) return;
          setExerciseUsageByMediaId({});
          setUsageReady(true);
        });
    };

    let idleCallbackId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(runUsageFetch, { timeout: 400 });
    } else {
      timeoutId = setTimeout(runUsageFetch, 0);
    }

    return () => {
      ac.abort();
      if (idleCallbackId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [open, exercisePicker, items]);

  const sortedFolders = useMemo(() => {
    if (folders.length === 0) return [];
    return folders.slice().sort((a, b) => {
      const pa = folderPathLabel(a, folders);
      const pb = folderPathLabel(b, folders);
      return pa.localeCompare(pb, "ru");
    });
  }, [folders]);

  const folderSelectValue =
    pickerFolderId === undefined ? "__all__" : pickerFolderId === null ? "__root__" : pickerFolderId;

  /** Base UI Select показывает сырое `value` в триггере — задаём человекочитаемую подпись явно. */
  const folderSelectDisplayLabel = useMemo(() => {
    if (pickerFolderId === undefined) return "Все папки";
    if (pickerFolderId === null) return "Корень";
    const f = folders.find((x) => x.id === pickerFolderId);
    if (f) return folderPathLabel(f, folders);
    return foldersLoaded ? pickerFolderId : "Загрузка…";
  }, [pickerFolderId, folders, foldersLoaded]);

  const kindFiltered = useMemo(() => narrowMediaLibraryPickerItemsByKind(items, kind), [items, kind]);
  const queryFiltered = useMemo(
    () => filterMediaLibraryPickerItemsByQuery(kindFiltered, query),
    [kindFiltered, query],
  );

  const displayedItems = useMemo(() => {
    if (!exercisePicker || !newOnly || !usageReady) return queryFiltered;
    return queryFiltered.filter((item) => {
      const u = exerciseUsageByMediaId[item.id.toLowerCase()];
      return !u?.length;
    });
  }, [exercisePicker, newOnly, queryFiltered, usageReady, exerciseUsageByMediaId]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Поиск по имени</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите часть имени файла"
        />
      </label>

      {exercisePicker ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Папка</span>
            <Select
              value={folderSelectValue}
              onValueChange={(v) => {
                if (v === "__all__") onPickerFolderIdChange(undefined);
                else if (v === "__root__") onPickerFolderIdChange(null);
                else onPickerFolderIdChange(v);
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-full max-w-full min-w-0 text-left">
                <SelectValue placeholder="Папка">{folderSelectDisplayLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Все папки</SelectItem>
                <SelectItem value="__root__">Корень</SelectItem>
                {sortedFolders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {folderPathLabel(f, folders)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <span className="text-xs text-muted-foreground">Фильтр</span>
            <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted/20 px-1.5 text-[11px]">
              <button
                type="button"
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  !newOnly ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setNewOnly(false)}
              >
                все
              </button>
              <span className="text-muted-foreground/60">|</span>
              <button
                type="button"
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  newOnly ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setNewOnly(true)}
              >
                только новые
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MediaPickerList
        items={displayedItems}
        loading={loading}
        error={error}
        onSelect={onPick}
        exerciseUsageByMediaId={exercisePicker ? exerciseUsageByMediaId : undefined}
      />
    </div>
  );
}

type Props = {
  kind: MediaLibraryPickerKind;
  value: string;
  onChange: (nextUrl: string, meta?: MediaLibraryPickMeta) => void;
  /** Library folder filter: `null` = root only; `undefined` = all files. */
  folderId?: string | null;
  /** Overrides dialog/sheet title (default: «Библиотека файлов»). */
  pickerTitle?: string;
  /** Overrides main button label (default: «Выбрать из библиотеки»). */
  selectButtonLabel?: string;
  /** For `image_or_video`: persisted type so preview works after reload (bare `/api/media/…`). */
  selectedPreviewKind?: MediaLibrarySelectedPreviewKind;
};

export function MediaLibraryPickerDialog({
  kind,
  value,
  onChange,
  folderId,
  pickerTitle = "Библиотека файлов",
  selectButtonLabel = "Выбрать из библиотеки",
  selectedPreviewKind,
}: Props) {
  const [open, setOpen] = useState(false);
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  const [hydratedPick, setHydratedPick] = useState<LastPick | null>(null);
  const hydrateRequestRef = useRef(0);
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  const exercisePicker = kind === "image_or_video";
  const [pickerFolderId, setPickerFolderId] = useState<string | null | undefined>(folderId);

  useEffect(() => {
    if (open) queueMicrotask(() => setPickerFolderId(folderId));
  }, [open, folderId]);

  const apiKind = kind === "image_or_video" ? "all" : kind;

  const effectiveFolderId = exercisePicker ? pickerFolderId : folderId;

  const listUrl = useMemo(
    () => buildAdminMediaListUrl({ apiKind, folderId: effectiveFolderId }),
    [apiKind, effectiveFolderId],
  );

  const effectiveLastPick = useMemo(() => {
    const t = value.trim();
    if (!t) return null;
    if (lastPick && lastPick.url === t) return lastPick;
    if (hydratedPick && hydratedPick.url === t) return hydratedPick;
    return null;
  }, [value, lastPick, hydratedPick]);

  useEffect(() => {
    const t = value.trim();
    const mediaId = parseMediaFileIdFromAppUrl(t);
    if (!mediaId) {
      queueMicrotask(() => setHydratedPick(null));
      return;
    }
    if (lastPick?.url === t) {
      queueMicrotask(() => setHydratedPick(null));
      return;
    }

    const requestId = ++hydrateRequestRef.current;
    const ac = new AbortController();
    queueMicrotask(() => setHydratedPick(null));

    void fetchAdminMediaListItem(mediaId, { signal: ac.signal })
      .then((item) => {
        if (ac.signal.aborted || requestId !== hydrateRequestRef.current) return;
        if (!item) return;
        const url = item.url.trim();
        if (url !== t) return;
        setHydratedPick({
          url,
          rowKind: item.kind,
          mimeType: item.mimeType,
          previewSmUrl: item.previewSmUrl,
          previewMdUrl: item.previewMdUrl,
          previewStatus: item.previewStatus,
        });
      })
      .catch(() => {});

    return () => ac.abort();
  }, [value, lastPick]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  const handlePickFromLibrary = useCallback(
    (item: MediaListItem) => {
      setLastPick({
        url: item.url,
        rowKind: item.kind,
        mimeType: item.mimeType,
        previewSmUrl: item.previewSmUrl,
        previewMdUrl: item.previewMdUrl,
        previewStatus: item.previewStatus,
      });
      onChange(item.url, {
        kind: item.kind,
        mimeType: item.mimeType,
        filename: item.filename,
        displayName: item.displayName,
      });
      setOpen(false);
    },
    [onChange],
  );

  const isApiMedia =
    value.startsWith("/api/media/") || /^https?:\/\//i.test(value.trim());

  /** Не показываем превью для legacy путей вне `/api/media/…` и без `https://`. */
  const previewMode = isApiMedia
    ? resolveSelectedPreview({
        value,
        kind,
        previewKind: selectedPreviewKind,
        lastPick: effectiveLastPick,
      })
    : null;

  const thumbKind: "image" | "video" =
    previewMode === "video" ? "video" : previewMode === "image" || previewMode === "gif" ? "image" : "image";
  const selectedPreviewMedia = mediaLibraryPickerSelectionToPreviewUi({
    value,
    thumbKind,
    lastPick: effectiveLastPick,
  });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="space-y-2 text-sm">
        {value ? (
          <>
            {previewMode === "video" || previewMode === "image" || previewMode === "gif" ? (
              <div
                className="max-w-md overflow-hidden rounded-md border border-border/60 bg-muted/30"
                data-testid="selected-media-preview"
              >
                <MediaThumb
                  media={selectedPreviewMedia}
                  className="h-40 w-full"
                  imgClassName="h-40 w-full object-contain bg-muted/30"
                  labels={{ skipped: "Превью не создаётся", failed: "Превью недоступно" }}
                  sizes="160px"
                />
              </div>
            ) : null}
            {!isApiMedia ? (
              <p className="text-xs text-amber-700">
                Legacy URL: для нового значения используйте выбор из библиотеки.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Файл не выбран</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(true);
          }}
        >
          {selectButtonLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setLastPick(null);
            onChange("");
          }}
        >
          Очистить
        </Button>
      </div>

      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>{pickerTitle}</SheetTitle>
            </SheetHeader>
            <div className="mt-3">
              <MediaLibraryPickerOpenPanel
                key={open ? "media-picker-open" : "media-picker-closed"}
                open={open}
                listUrl={listUrl}
                kind={kind}
                onPick={handlePickFromLibrary}
                exercisePicker={exercisePicker}
                pickerFolderId={pickerFolderId}
                onPickerFolderIdChange={setPickerFolderId}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{pickerTitle}</DialogTitle>
            </DialogHeader>
            <MediaLibraryPickerOpenPanel
              key={open ? "media-picker-open" : "media-picker-closed"}
              open={open}
              listUrl={listUrl}
              kind={kind}
              onPick={handlePickFromLibrary}
              exercisePicker={exercisePicker}
              pickerFolderId={pickerFolderId}
              onPickerFolderIdChange={setPickerFolderId}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
