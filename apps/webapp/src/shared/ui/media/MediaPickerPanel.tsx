"use client";

import { type ChangeEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPickerList, type MediaListItem } from "@/shared/ui/media/MediaPickerList";
import {
  buildAdminMediaListUrl,
  filterMediaLibraryPickerItemsByQuery,
  invalidateMediaLibraryPickerListCache,
  narrowMediaLibraryPickerItemsByKind,
  useMediaLibraryPickerItems,
  type MediaLibraryPickerKindFilter,
} from "@/shared/ui/media/useMediaLibraryPickerItems";
import type { MediaExerciseUsageEntry, MediaFolderRecord } from "@/modules/media/types";
import { cn } from "@/lib/utils";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";
import { fetchAdminMediaListItem } from "@/shared/ui/media/fetchAdminMediaListItem";
import { UploadRequestError, uploadWithProgress } from "@/shared/ui/media/uploadWithProgress";
import { FILE_INPUT_ACCEPT } from "@/modules/media/uploadAllowedMime";
import { MediaLibraryFolderScopeSelect } from "@/shared/ui/media/MediaLibraryFolderScopeSelect";
import { mediaFolderPathLabel } from "@/shared/ui/media/mediaFolderScopeUtils";

type MediaPickerListSortPreset = "date:desc" | "date:asc" | "name:asc" | "name:desc";

const MEDIA_PICKER_SORT_OPTIONS: { value: MediaPickerListSortPreset; label: string }[] = [
  { value: "date:desc", label: "Сначала новые" },
  { value: "date:asc", label: "Сначала старые" },
  { value: "name:asc", label: "Название А→Я" },
  { value: "name:desc", label: "Название Я→А" },
];

function parseMediaPickerListSortPreset(preset: MediaPickerListSortPreset): {
  sortBy: "date" | "name";
  sortDir: "asc" | "desc";
} {
  const [a, b] = preset.split(":") as ["date" | "name", "asc" | "desc"];
  return { sortBy: a, sortDir: b };
}

function kindFromMimeForListItem(mimeType: string): MediaListItem["kind"] {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  return "file";
}

type UploadOkSingle = {
  ok?: boolean;
  mediaId?: string;
  url?: string;
  uploaded?: Array<{ mediaId: string; url: string; filename: string; mimeType: string; size: number }>;
  error?: string;
};

/** Куда класть файл при загрузке с устройства: при фильтре «Все папки» — корень. */
function resolveUploadTargetFolderId(listFolderId: string | null | undefined): string | null {
  if (listFolderId === undefined) return null;
  return listFolderId ?? null;
}

function appendFolderIdToFormData(fd: FormData, folderId: string | null) {
  if (folderId === null) {
    fd.set("folderId", "root");
    return;
  }
  fd.set("folderId", folderId);
}

function isPickedRowAllowedForKind(item: MediaListItem, kind: MediaLibraryPickerKindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "image") return item.kind === "image";
  if (kind === "video") return item.kind === "video";
  if (kind === "image_or_video") return item.kind === "image" || item.kind === "video";
  return true;
}

function uploadKindRejectedRuMessage(kind: MediaLibraryPickerKindFilter): string {
  switch (kind) {
    case "image":
      return "Для этого поля можно прикрепить только изображение.";
    case "video":
      return "Для этого поля можно прикрепить только видео.";
    case "image_or_video":
      return "Для этого поля можно прикрепить только изображение или видео.";
    default:
      return "Этот тип файла здесь нельзя использовать.";
  }
}

function mapUploadErrorByCode(code: string | undefined): string {
  const m: Record<string, string> = {
    mime_not_allowed: "Тип файла не разрешён для загрузки.",
    file_signature_mismatch: "Содержимое файла не совпадает с заявленным типом.",
    file_too_large: "Файл слишком большой.",
    empty_file: "Пустой файл.",
    missing_file: "Файл не передан.",
    invalid_folder_id: "Некорректный идентификатор папки.",
    folder_not_found: "Папка не найдена.",
    forbidden: "Нет прав на загрузку.",
    upload_failed: "Загрузка не удалась.",
    expected_multipart: "Неверный формат запроса.",
    invalid_body: "Некорректное тело запроса.",
  };
  if (code && m[code]) return m[code];
  if (code) return `Не удалось загрузить (${code}).`;
  return "Не удалось загрузить файл.";
}

function fileInputAcceptForPickerKind(kind: MediaLibraryPickerKindFilter): string | undefined {
  switch (kind) {
    case "image":
      return "image/*,.heic,.heif,.avif,.tiff,.tif,.svg";
    case "video":
      return "video/*";
    case "image_or_video":
      return "image/*,video/*,.heic,.heif,.avif,.tiff,.tif";
    case "all":
      return FILE_INPUT_ACCEPT;
    default:
      return undefined;
  }
}

export type MediaPickerPanelProps = {
  open: boolean;
  apiKind: string;
  /** List filter: `undefined` = all folders, `null` = root only, uuid = that folder */
  folderId?: string | null | undefined;
  kind: MediaLibraryPickerKindFilter;
  onPick: (item: MediaListItem) => void;
  exercisePicker: boolean;
  /** Изменить фильтр списка по папке */
  onPickerFolderIdChange: (next: string | null | undefined) => void;
  /** When false, sort stays server default (date desc) without extra UI */
  showSort: boolean;
  /** Блок «Папка» (все / корень / конкретная папка). По умолчанию включён. */
  showFolderScope?: boolean;
};

/**
 * Общее тело медиа-пикера: вкладка библиотеки (поиск / папки / сортировка по флагам) и загрузка с устройства.
 */
export function MediaPickerPanel({
  open,
  apiKind,
  folderId,
  kind,
  onPick,
  exercisePicker,
  onPickerFolderIdChange,
  showSort,
  showFolderScope = true,
}: MediaPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [listSortPreset, setListSortPreset] = useState<MediaPickerListSortPreset>("date:desc");
  const [folders, setFolders] = useState<MediaFolderRecord[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [exerciseUsageByMediaId, setExerciseUsageByMediaId] = useState<
    Record<string, MediaExerciseUsageEntry[]>
  >({});
  const [usageReady, setUsageReady] = useState(false);
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputId = useId();

  const { sortBy: listSortBy, sortDir: listSortDir } = useMemo(
    () => parseMediaPickerListSortPreset(listSortPreset),
    [listSortPreset],
  );

  const listUrl = useMemo(
    () =>
      buildAdminMediaListUrl({
        apiKind,
        folderId,
        sortBy: showSort ? listSortBy : "date",
        sortDir: showSort ? listSortDir : "desc",
      }),
    [apiKind, folderId, listSortBy, listSortDir, showSort],
  );

  const { items, loading, error } = useMediaLibraryPickerItems({
    open,
    listUrl,
    reloadKey: libraryReloadKey,
  });

  const usageRequestRef = useRef(0);

  useEffect(() => {
    if (!open || !showFolderScope) {
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
  }, [open, showFolderScope]);

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

  const uploadTargetFolderId = useMemo(() => resolveUploadTargetFolderId(folderId), [folderId]);

  const uploadDestinationPhrase = useMemo(() => {
    if (uploadTargetFolderId === null) return "корень библиотеки";
    const f = folders.find((x) => x.id === uploadTargetFolderId);
    const path = f ? mediaFolderPathLabel(f, folders) : uploadTargetFolderId;
    return `папку «${path}»`;
  }, [uploadTargetFolderId, folders]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setUploading(true);
      setUploadProgress(0);
      try {
        const fd = new FormData();
        fd.set("file", file);
        appendFolderIdToFormData(fd, uploadTargetFolderId);
        const data = await uploadWithProgress<UploadOkSingle>({
          url: "/api/media/upload",
          formData: fd,
          onProgress: (loaded, total) => {
            if (total > 0) setUploadProgress(Math.round((100 * loaded) / total));
          },
        });
        if (!data.ok || !data.mediaId) {
          setUploadError(mapUploadErrorByCode(data.error));
          return;
        }
        let row: MediaListItem | null = await fetchAdminMediaListItem(data.mediaId);
        if (!row) {
          const u = data.url;
          const up = data.uploaded?.[0];
          const mime = up?.mimeType ?? file.type ?? "application/octet-stream";
          if (u) {
            row = {
              id: data.mediaId,
              kind: kindFromMimeForListItem(mime),
              filename: up?.filename ?? file.name,
              displayName: null,
              mimeType: mime,
              size: up?.size ?? file.size,
              createdAt: new Date().toISOString(),
              url: u,
            };
          }
        }
        if (!row) {
          setUploadError("Файл загружен, но не удалось получить данные для выбора. Обновите список в библиотеке.");
          return;
        }
        if (!isPickedRowAllowedForKind(row, kind)) {
          setUploadError(uploadKindRejectedRuMessage(kind));
          return;
        }
        invalidateMediaLibraryPickerListCache(listUrl);
        setLibraryReloadKey((k) => k + 1);
        onPick(row);
      } catch (e) {
        if (e instanceof UploadRequestError) {
          if (e.status === 0) {
            setUploadError("Сеть недоступна. Проверьте подключение и попробуйте снова.");
          } else {
            const body = e.data as { error?: string } | null | undefined;
            setUploadError(mapUploadErrorByCode(body?.error));
          }
        } else {
          setUploadError(mapUploadErrorByCode(undefined));
        }
      } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onPick, uploadTargetFolderId, kind, listUrl],
  );

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void handleUploadFile(f);
    },
    [handleUploadFile],
  );

  return (
    <Tabs defaultValue="library" className="flex flex-col gap-3">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="library" className="flex-1 sm:flex-none">
          Из библиотеки
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex-1 sm:flex-none">
          Загрузить с устройства
        </TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="mt-0 flex flex-col gap-3 outline-none">
        <PickerSearchField
          label="Поиск по имени"
          placeholder="Введите часть имени файла"
          value={query}
          onValueChange={setQuery}
        />

        {showSort ? (
          <div className="flex min-w-[12rem] max-w-md flex-col gap-1">
            <span className="text-xs text-muted-foreground">Порядок списка</span>
            <Select
              value={listSortPreset}
              onValueChange={(v) => setListSortPreset(v as MediaPickerListSortPreset)}
            >
              <SelectTrigger size="sm" className="w-full text-left">
                <SelectValue placeholder="Порядок списка">
                  {MEDIA_PICKER_SORT_OPTIONS.find((o) => o.value === listSortPreset)?.label ?? "Сначала новые"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MEDIA_PICKER_SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {(showFolderScope || exercisePicker) ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            {showFolderScope ? (
              <MediaLibraryFolderScopeSelect
                className="min-w-0 sm:max-w-md"
                value={folderId}
                onChange={onPickerFolderIdChange}
                folders={folders}
                foldersLoaded={foldersLoaded}
              />
            ) : null}
            {exercisePicker ? (
              <div className="flex flex-col gap-1 sm:items-end">
                <span className="text-xs text-muted-foreground">Фильтр</span>
                <div className="flex h-[32px] shrink-0 items-center gap-1 rounded-md border border-border bg-muted/20 px-1.5 text-[11px] leading-tight">
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
            ) : null}
          </div>
        ) : null}

        <MediaPickerList
          items={displayedItems}
          loading={loading}
          error={error}
          onSelect={onPick}
          exerciseUsageByMediaId={exercisePicker ? exerciseUsageByMediaId : undefined}
          enableQuickPreview={exercisePicker}
        />
      </TabsContent>

      <TabsContent value="upload" className="mt-0 flex flex-col gap-3 outline-none">
        <p className="text-sm text-muted-foreground">
          Файл будет загружен в{" "}
          <span className="font-medium text-foreground">{uploadDestinationPhrase}</span>.
        </p>
        {folderId === undefined ? (
          <p className="text-xs text-muted-foreground">
            При фильтре списка «Все папки» загрузка всегда выполняется в корень библиотеки.
          </p>
        ) : null}
        <input
          id={uploadInputId}
          ref={fileInputRef}
          type="file"
          className="sr-only"
          disabled={uploading}
          accept={fileInputAcceptForPickerKind(kind)}
          onChange={onFileInputChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            aria-label="Выбрать файл для загрузки в медиабиблиотеку"
            onClick={() => fileInputRef.current?.click()}
          >
            Выбрать файл…
          </Button>
          {uploading ? <span className="text-sm text-muted-foreground">Загрузка…</span> : null}
        </div>
        {uploading && uploadProgress > 0 ? (
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        ) : null}
        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      </TabsContent>
    </Tabs>
  );
}
