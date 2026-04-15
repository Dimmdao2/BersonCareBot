"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { VideoThumbnailPreview } from "@/shared/ui/media/VideoThumbnailPreview";
import { MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS } from "@/shared/ui/media/mediaLibrarySearchDebounceMs";

export type MediaLibraryPickerKind = "image" | "video" | "image_or_video";

export type MediaLibraryPickMeta = Pick<MediaListItem, "kind" | "mimeType" | "filename">;

/** When `kind` is `image_or_video`, hints preview for bare `/api/media/:id` URLs after reload. */
export type MediaLibrarySelectedPreviewKind = "image" | "video" | "gif";

type LastPick = { url: string; rowKind: MediaListItem["kind"]; mimeType: string };

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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);
  const openWasFalseRef = useRef(true);

  const apiKind = kind === "image_or_video" ? "all" : kind;

  const fetchUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", apiKind);
    p.set("sortBy", "date");
    p.set("sortDir", "desc");
    if (debouncedQuery.trim()) p.set("q", debouncedQuery.trim());
    p.set("limit", "80");
    if (folderId !== undefined) {
      if (folderId === null) p.set("folderId", "root");
      else p.set("folderId", folderId);
    }
    return `/api/admin/media?${p.toString()}`;
  }, [apiKind, debouncedQuery, folderId]);

  const displayItems = useMemo(() => {
    if (kind !== "image_or_video") return items;
    return items.filter((i) => i.kind === "image" || i.kind === "video");
  }, [items, kind]);

  // Debounce search: immediate sync when dialog opens; then delay while typing.
  useEffect(() => {
    if (!open) {
      openWasFalseRef.current = true;
      return;
    }
    if (openWasFalseRef.current) {
      openWasFalseRef.current = false;
      queueMicrotask(() => setDebouncedQuery(query.trim()));
      return;
    }
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, query]);

  const effectiveLastPick = useMemo(() => {
    const t = value.trim();
    if (!t || !lastPick) return null;
    return lastPick.url === t ? lastPick : null;
  }, [value, lastPick]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(fetchUrl, { credentials: "same-origin", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: MediaListItem[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
        if (!ac.signal.aborted) setItems(data.items ?? []);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name === "AbortError") return;
        setError("Не удалось загрузить библиотеку");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, fetchUrl]);

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

  const pickerBody = (
    <div className="flex flex-col gap-3">
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Поиск по имени</span>
        <Input
          value={query}
          onChange={(e) => {
            setError(null);
            setQuery(e.target.value);
          }}
          placeholder="Введите часть имени файла"
        />
      </label>
      <MediaPickerList
        items={displayItems}
        loading={loading}
        error={error}
        onSelect={(item) => {
          setLastPick({ url: item.url, rowKind: item.kind, mimeType: item.mimeType });
          onChange(item.url, { kind: item.kind, mimeType: item.mimeType, filename: item.filename });
          setOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDebouncedQuery(query.trim());
            setError(null);
            setLoading(true);
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

      {value ? (
        <div className="space-y-2 text-sm">
          {previewMode === "video" ? (
            <div
              className="max-w-md overflow-hidden rounded-md border border-border/60 bg-muted/30"
              data-testid="selected-media-preview"
            >
              <VideoThumbnailPreview src={value} className="h-40 w-full object-contain" />
            </div>
          ) : previewMode === "image" || previewMode === "gif" ? (
            <div
              className="max-w-md overflow-hidden rounded-md border border-border/60 bg-muted/30"
              data-testid="selected-media-preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="h-40 w-full object-contain" />
            </div>
          ) : null}
          <p className="text-muted-foreground">
            <span className="text-xs">URL: </span>
            <span className="break-all font-mono text-xs">{value}</span>
          </p>
          {!isApiMedia ? (
            <p className="text-xs text-amber-700">
              Legacy URL: для нового значения используйте выбор из библиотеки.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Файл не выбран</p>
      )}

      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>{pickerTitle}</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{pickerBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{pickerTitle}</DialogTitle>
            </DialogHeader>
            {pickerBody}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
