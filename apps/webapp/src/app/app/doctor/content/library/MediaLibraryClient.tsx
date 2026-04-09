"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FILE_INPUT_ACCEPT } from "@/modules/media/uploadAllowedMime";
import { putWithProgress, UploadRequestError, uploadWithProgress } from "./uploadWithProgress";
import { MediaCard } from "./MediaCard";
import { MediaLightbox } from "./MediaLightbox";

type MediaKindFilter = "all" | "image" | "video" | "audio" | "file";
type SortBy = "date" | "size" | "type";
type SortDir = "asc" | "desc";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  size: number;
  createdAt: string;
  url: string;
};

type UsageRef = {
  pageId: string;
  pageSlug: string;
  field: "image_url" | "video_url" | "body_md" | "body_html";
};

type UploadOkResponse = {
  ok: boolean;
  error?: string;
  filename?: string;
};

type MediaListResponse = {
  ok?: boolean;
  items?: MediaItem[];
  error?: string;
  hasMore?: boolean;
  nextOffset?: number;
};

type ViewMode = "media" | "files";

const VIEW_MODE_STORAGE_KEY = "doctor-media-library-view-v2";
const VIEW_MODE_LEGACY_KEY = "doctor-media-library-view";
const PAGE_SIZE = 24;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

type DeleteDialogState =
  | null
  | { item: MediaItem; phase: "confirm" }
  | { item: MediaItem; phase: "in_use"; usage: UsageRef[] };

export function MediaLibraryClient() {
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isMobileUploadUi, setIsMobileUploadUi] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("files");
  const [isDragActive, setIsDragActive] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [s3DeleteQueueErrors, setS3DeleteQueueErrors] = useState<number | null>(null);
  const desktopUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mobileFilesInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCaptureInputRef = useRef<HTMLInputElement | null>(null);

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    if (query.trim()) p.set("q", query.trim());
    return p.toString();
  }, [kind, sortBy, sortDir, query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/media?${searchParams}&limit=${PAGE_SIZE}&offset=0`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as MediaListResponse;
        if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
        if (!cancelled) {
          setItems(data.items ?? []);
          setHasMore(Boolean(data.hasMore));
          setNextOffset(data.nextOffset ?? (data.items?.length ?? 0));
          setLightboxIndex(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить библиотеку");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/media/delete-errors?limit=1", { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; total?: number };
        if (!res.ok || !data.ok) return;
        if (!cancelled) setS3DeleteQueueErrors(data.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setS3DeleteQueueErrors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const applyViewport = () => {
      const mobile = mq.matches;
      setIsMobileUploadUi(mobile);
      if (mobile) {
        setViewMode("media");
      } else {
        let savedView = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (!savedView) {
          const legacy = window.localStorage.getItem(VIEW_MODE_LEGACY_KEY);
          if (legacy === "grid") savedView = "media";
          else if (legacy === "table") savedView = "files";
        }
        if (savedView === "media" || savedView === "files") {
          setViewMode(savedView);
        } else {
          setViewMode("files");
        }
      }
    };
    applyViewport();
    mq.addEventListener("change", applyViewport);
    return () => mq.removeEventListener("change", applyViewport);
  }, []);

  function onChangeViewMode(nextMode: ViewMode) {
    setViewMode(nextMode);
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
  }

  function openLightboxByItemId(itemId: string) {
    const index = items.findIndex((item) => item.id === itemId);
    if (index >= 0) setLightboxIndex(index);
  }

  const lightboxItem = lightboxIndex !== null ? (items[lightboxIndex] ?? null) : null;

  async function onLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?${searchParams}&limit=${PAGE_SIZE}&offset=${nextOffset}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as MediaListResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "load_more_failed");
      const incoming = data.items ?? [];
      setItems((prev) => {
        const known = new Set(prev.map((item) => item.id));
        const unique = incoming.filter((item) => !known.has(item.id));
        return [...prev, ...unique];
      });
      setHasMore(Boolean(data.hasMore));
      setNextOffset(data.nextOffset ?? (nextOffset + incoming.length));
    } catch {
      setError("Не удалось загрузить следующую страницу");
    } finally {
      setLoadingMore(false);
    }
  }

  async function onCopyUrl(item: MediaItem) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = item.url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopiedItemId(item.id);
      window.setTimeout(() => {
        setCopiedItemId((current) => (current === item.id ? null : current));
      }, 1500);
    } catch {
      setError("Не удалось скопировать URL");
    }
  }

  useEffect(() => {
    if (isMobileUploadUi) return undefined;
    const onWindowDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const onWindowDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      setIsDragActive(false);
    };
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [isMobileUploadUi]);

  async function uploadBatch(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadPercent(0);
    setUploadStatus(null);
    setError(null);
    try {
      const totalBytes = files.reduce((acc, file) => acc + Math.max(file.size, 1), 0);
      let uploadedBytes = 0;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        setUploadStatus(`Файл ${i + 1}/${files.length}: ${file.name}`);
        const mime = (file.type || "application/octet-stream").toLowerCase();

        const presignRes = await fetch("/api/media/presign", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name || "upload",
            mimeType: mime,
            size: file.size,
          }),
        });
        const presignData = (await presignRes.json().catch(() => ({}))) as {
          ok?: boolean;
          uploadUrl?: string;
          mediaId?: string;
          error?: string;
        };

        if (presignRes.status === 501 || presignData.error === "s3_not_configured") {
          const fd = new FormData();
          fd.set("file", file);
          await uploadWithProgress<UploadOkResponse>({
            url: "/api/media/upload",
            formData: fd,
            withCredentials: true,
            onProgress: (loaded) => {
              const next = Math.round(((uploadedBytes + loaded) / totalBytes) * 100);
              setUploadPercent(Math.max(0, Math.min(100, next)));
            },
          });
        } else if (!presignRes.ok || !presignData.ok || !presignData.uploadUrl || !presignData.mediaId) {
          throw new UploadRequestError(presignRes.status, presignData);
        } else {
          await putWithProgress({
            url: presignData.uploadUrl,
            body: file,
            contentType: mime,
            onProgress: (loaded) => {
              const next = Math.round(((uploadedBytes + loaded) / totalBytes) * 100);
              setUploadPercent(Math.max(0, Math.min(100, next)));
            },
          });
          const confirmRes = await fetch("/api/media/confirm", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mediaId: presignData.mediaId }),
          });
          const confirmData = (await confirmRes.json().catch(() => ({}))) as { ok?: boolean };
          if (!confirmRes.ok || !confirmData.ok) {
            throw new UploadRequestError(confirmRes.status, confirmData);
          }
        }
        uploadedBytes += Math.max(file.size, 1);
        const next = Math.round((uploadedBytes / totalBytes) * 100);
        setUploadPercent(Math.max(0, Math.min(100, next)));
      }
      setUploadStatus(`Загрузка завершена: ${files.length} файлов`);
      setReloadKey((x) => x + 1);
    } catch (e) {
      if (e instanceof UploadRequestError) {
        const payload = (e.data ?? {}) as { error?: string; filename?: string };
        if (payload.filename) {
          setError(`Не удалось загрузить файл: ${payload.filename}`);
        } else if (payload.error === "network_error") {
          setError("Сетевая ошибка при загрузке");
        } else {
          setError("Не удалось загрузить файл");
        }
      } else {
        setError("Не удалось загрузить файл");
      }
      setUploadStatus("Загрузка остановлена из-за ошибки");
    } finally {
      setUploading(false);
      setTimeout(() => {
        setUploadPercent(null);
        setUploadStatus(null);
      }, 1200);
    }
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadBatch(files);
  }

  function onDropZoneDrop(event: ReactDragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (uploading) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    void uploadBatch(files);
  }

  function openDeleteDialog(item: MediaItem) {
    setDeleteDialog({ item, phase: "confirm" });
  }

  async function executeDelete(force: boolean) {
    if (!deleteDialog) return;
    const item = deleteDialog.item;
    setDeletingId(item.id);
    setError(null);
    try {
      const q = force ? "?confirmDelete=true&confirmUsed=true" : "?confirmDelete=true";
      const res = await fetch(`/api/admin/media/${item.id}${q}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 409 && !force) {
        const data = (await res.json()) as { usage?: UsageRef[] };
        const usage = data.usage ?? [];
        setDeleteDialog({ item, phase: "in_use", usage });
        return;
      }
      if (!res.ok) throw new Error("delete_failed");
      setDeleteDialog(null);
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось удалить файл");
    } finally {
      setDeletingId(null);
    }
  }

  const deleteItem = deleteDialog?.item ?? null;
  const deletePhase = deleteDialog?.phase;

  return (
    <div className="flex flex-col gap-4">
      <Dialog
        open={deleteDialog !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={deletingId === null}>
          {deleteItem && deletePhase === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>Удалить файл?</DialogTitle>
                <DialogDescription>
                  Файл «{deleteItem.filename}» сразу пропадёт из библиотеки; окончательное удаление из хранилища
                  выполняется в фоне на сервере.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDeleteDialog(null)} disabled={deletingId !== null}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingId !== null}
                  onClick={() => void executeDelete(false)}
                >
                  {deletingId === deleteItem.id ? "Удаление..." : "Удалить"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {deleteItem && deletePhase === "in_use" && deleteDialog && deleteDialog.phase === "in_use" ? (
            <>
              <DialogHeader>
                <DialogTitle>Файл используется в CMS</DialogTitle>
                <DialogDescription>
                  Этот файл всё ещё указан на страницах контента. Удаление может сломать ссылки. Файл сразу
                  исчезнет из библиотеки; очистка в хранилище — в фоне.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-foreground">
                  {deleteDialog.usage.slice(0, 12).map((u) => (
                    <li key={`${u.pageId}-${u.field}`}>
                      {u.pageSlug} ({u.field})
                    </li>
                  ))}
                </ul>
                {deleteDialog.usage.length > 12 ? (
                  <p className="text-xs text-muted-foreground">…и ещё {deleteDialog.usage.length - 12}</p>
                ) : null}
                <p className="font-medium text-foreground">Удалить всё равно?</p>
              </div>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDeleteDialog(null)} disabled={deletingId !== null}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingId !== null}
                  onClick={() => void executeDelete(true)}
                >
                  {deletingId === deleteItem.id ? "Удаление..." : "Удалить всё равно"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <input
        ref={desktopUploadInputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={onUploadFile}
        disabled={uploading}
      />
      <input
        ref={mobileFilesInputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={onUploadFile}
        disabled={uploading}
      />
      <input
        ref={mobileCaptureInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        onChange={onUploadFile}
        disabled={uploading}
      />

      <div className="flex flex-wrap items-end gap-2">
        {s3DeleteQueueErrors != null && s3DeleteQueueErrors > 0 ? (
          <Link
            href="/app/doctor/content/library/delete-errors"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/15"
          >
            Ошибки удаления S3
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
              {s3DeleteQueueErrors}
            </span>
          </Link>
        ) : null}
        <div className="flex h-10 items-center rounded-md border border-input bg-background p-1">
          <Button
            type="button"
            variant={viewMode === "media" ? "default" : "ghost"}
            size="sm"
            className="h-8"
            title="Плитка как в галерее"
            onClick={() => onChangeViewMode("media")}
          >
            Медиа
          </Button>
          <Button
            type="button"
            variant={viewMode === "files" ? "default" : "ghost"}
            size="sm"
            className="h-8"
            title="Список файлов"
            onClick={() => onChangeViewMode("files")}
          >
            Файлы
          </Button>
        </div>

        <label className="flex min-w-[9rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Тип</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaKindFilter)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="all">Все</option>
            <option value="image">Изображения</option>
            <option value="video">Видео</option>
            <option value="audio">Аудио</option>
            <option value="file">Файлы</option>
          </select>
        </label>

        <label className="flex min-w-[9rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Сортировать по</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="date">Дате загрузки</option>
            <option value="size">Размеру</option>
            <option value="type">Типу</option>
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Порядок</span>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
            className="h-10 rounded-md border border-input bg-background px-2"
          >
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </label>

        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Поиск по имени</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например, welcome-video"
          />
        </label>

        {isMobileUploadUi ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={uploading}
              onClick={() => mobileCaptureInputRef.current?.click()}
            >
              Снять фото/видео
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={uploading}
              onClick={() => mobileFilesInputRef.current?.click()}
            >
              {uploading ? "Загрузка..." : "Выбрать из файлов"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={uploading}
            onClick={() => desktopUploadInputRef.current?.click()}
          >
            {uploading ? "Загрузка..." : "Загрузить файлы"}
          </Button>
        )}
      </div>

      {!isMobileUploadUi ? (
        <label
          onDragEnter={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            if (!isDragActive) setIsDragActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsDragActive(false);
            }
          }}
          onDrop={onDropZoneDrop}
          className={`rounded-md border border-dashed p-3 text-sm transition-colors ${
            isDragActive ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20"
          }`}
        >
          <p className="text-foreground">Перетащите файлы сюда для загрузки</p>
          <p className="text-xs text-muted-foreground">
            Desktop: drag-and-drop поддерживается для фото, видео, аудио и PDF
          </p>
        </label>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {uploadPercent !== null ? (
        <div className="flex flex-col gap-1 rounded-md border border-border/70 bg-muted/20 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{uploadStatus ?? "Загрузка..."}</span>
            <span className="font-medium">{uploadPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${uploadPercent}%` }} />
          </div>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Загрузка...</p> : null}

      {!loading &&
        (viewMode === "media" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                deleting={deletingId === item.id}
                copied={copiedItemId === item.id}
                onOpenPreview={() => openLightboxByItemId(item.id)}
                onDelete={() => openDeleteDialog(item)}
                onCopyUrl={() => void onCopyUrl(item)}
                formatSize={formatSize}
                formatDate={formatDate}
              />
            ))}
            {items.length === 0 ? (
              <div className="col-span-full rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Файлы не найдены
              </div>
            ) : null}
          </div>
        ) : isMobileUploadUi ? (
          <div className="flex flex-col divide-y rounded-md border border-border">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium text-foreground">{item.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.kind} · {formatSize(item.size)} · {formatDate(item.createdAt)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => void onCopyUrl(item)}>
                    {copiedItemId === item.id ? "OK" : "URL"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    disabled={deletingId === item.id}
                    onClick={() => openDeleteDialog(item)}
                  >
                    {deletingId === item.id ? "…" : "Удалить"}
                  </Button>
                </div>
              </div>
            ))}
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Файлы не найдены</div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Файл</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Размер</th>
                  <th className="px-3 py-2">Дата загрузки</th>
                  <th className="px-3 py-2">Просмотр</th>
                  <th className="px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">{item.filename}</td>
                    <td className="px-3 py-2">{item.kind}</td>
                    <td className="px-3 py-2">{formatSize(item.size)}</td>
                    <td className="px-3 py-2">{formatDate(item.createdAt)}</td>
                    <td className="px-3 py-2">
                      {item.kind === "image" ? (
                        <button type="button" onClick={() => openLightboxByItemId(item.id)} className="rounded border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url} alt="" className="max-h-16 max-w-28 rounded object-cover" />
                        </button>
                      ) : item.kind === "video" ? (
                        <button type="button" onClick={() => openLightboxByItemId(item.id)} className="rounded border border-border">
                          <video className="max-h-16 max-w-28 rounded" preload="metadata">
                            <source src={item.url} />
                          </video>
                        </button>
                      ) : item.kind === "audio" ? (
                        <button type="button" onClick={() => openLightboxByItemId(item.id)} className="text-primary underline">
                          Прослушать
                        </button>
                      ) : (
                        <button type="button" onClick={() => openLightboxByItemId(item.id)} className="text-primary underline">
                          Открыть
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void onCopyUrl(item)}>
                          {copiedItemId === item.id ? "URL скопирован" : "Скопировать URL"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10"
                          disabled={deletingId === item.id}
                          onClick={() => openDeleteDialog(item)}
                        >
                          {deletingId === item.id ? "Удаление..." : "Удалить"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Файлы не найдены
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ))}

      <MediaLightbox
        open={lightboxIndex !== null && lightboxItem !== null}
        item={lightboxItem}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null);
        }}
        onPrev={
          lightboxIndex !== null && lightboxIndex > 0
            ? () => setLightboxIndex((idx) => (idx === null ? null : Math.max(0, idx - 1)))
            : undefined
        }
        onNext={
          lightboxIndex !== null && lightboxIndex < items.length - 1
            ? () => setLightboxIndex((idx) => (idx === null ? null : Math.min(items.length - 1, idx + 1)))
            : undefined
        }
      />

      {!loading && items.length > 0 ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void onLoadMore()} disabled={!hasMore || loadingMore}>
            {!hasMore ? "Больше файлов нет" : loadingMore ? "Загрузка..." : "Загрузить ещё"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
