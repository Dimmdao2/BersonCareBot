"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { fetchAdminMediaListItem } from "@/shared/ui/media/fetchAdminMediaListItem";
import { mediaLibraryPickerSelectionToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

const MediaPickerShell = dynamic(
  () => import("@/shared/ui/media/MediaPickerShell").then((mod) => mod.MediaPickerShell),
  { ssr: false },
);

const MediaPickerPanel = dynamic(
  () => import("@/shared/ui/media/MediaPickerPanel").then((mod) => mod.MediaPickerPanel),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 text-sm text-muted-foreground">
        Загрузка библиотеки…
      </div>
    ),
  },
);

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
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  const [hydratedPick, setHydratedPick] = useState<LastPick | null>(null);
  const hydrateRequestRef = useRef(0);

  const exercisePicker = kind === "image_or_video";
  const [pickerFolderId, setPickerFolderId] = useState<string | null | undefined>(folderId);

  useEffect(() => {
    if (open) queueMicrotask(() => setPickerFolderId(folderId));
  }, [open, folderId]);

  const apiKind = kind === "image_or_video" ? "all" : kind;

  const effectiveFolderId = exercisePicker ? pickerFolderId : folderId;

  const effectiveLastPick = useMemo(() => {
    const t = value.trim();
    if (!t) return null;
    if (lastPick && lastPick.url === t) return lastPick;
    if (hydratedPick && hydratedPick.url === t) return hydratedPick;
    return null;
  }, [value, lastPick, hydratedPick]);

  /** Сброс lastPick при внешнем изменении value (например reset формы упражнения). */
  useEffect(() => {
    const t = value.trim();
    queueMicrotask(() => {
      setLastPick((prev) => {
        if (!prev) return null;
        if (prev.url === t) return prev;
        return null;
      });
    });
  }, [value]);

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

      <MediaPickerShell open={open} onOpenChange={handleOpenChange} title={pickerTitle}>
        <MediaPickerPanel
          key={open ? "media-picker-open" : "media-picker-closed"}
          open={open}
          apiKind={apiKind}
          folderId={effectiveFolderId}
          kind={kind}
          onPick={handlePickFromLibrary}
          exercisePicker={exercisePicker}
          pickerFolderId={pickerFolderId}
          onPickerFolderIdChange={setPickerFolderId}
          showSort
        />
      </MediaPickerShell>
    </div>
  );
}
