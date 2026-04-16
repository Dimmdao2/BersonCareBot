"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FILE_INPUT_ACCEPT } from "@/modules/media/uploadAllowedMime";
import { libraryMultipartAbort, libraryMultipartUpload } from "./libraryMultipartUpload";
import { UploadRequestError, uploadWithProgress } from "./uploadWithProgress";
import { MediaCard } from "./MediaCard";
import { MediaCardActionsMenu } from "./MediaCardActionsMenu";
import { MediaLightbox } from "./MediaLightbox";
import { canRenderInlineImage } from "./mediaPreview";
import type { MediaPreviewStatus } from "@/modules/media/types";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { libraryMediaRowToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";

type MediaKindFilter = "all" | "image" | "video" | "audio" | "file";
type SortBy = "date" | "size" | "type";
type SortDir = "asc" | "desc";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mimeType: string;
  filename: string;
  displayName?: string | null;
  size: number;
  userId?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
  url: string;
  folderId?: string | null;
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
};

type FolderRow = { id: string; parentId: string | null; name: string; createdAt: string };

type Crumb = { id: string | null; label: string };

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

function TableMediaThumb({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const thumbMedia = libraryMediaRowToPreviewUi(item);
  if (item.kind !== "image" && item.kind !== "video") {
    return (
      <button type="button" onClick={onOpen} className="rounded border border-border">
        <div className="flex h-16 w-28 items-center justify-center bg-muted/30 text-xs text-muted-foreground">—</div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="rounded border border-border">
      <MediaThumb
        media={thumbMedia}
        className="flex h-16 w-28 items-center justify-center rounded"
        imgClassName="max-h-16 max-w-28 rounded object-contain bg-muted/30"
        labels={{ skipped: "—", failed: "—" }}
      />
    </button>
  );
}

type DeleteDialogState =
  | null
  | { item: MediaItem; phase: "confirm" }
  | { item: MediaItem; phase: "in_use"; usage: UsageRef[] };

type RenameDialogState = null | { item: MediaItem; nextDisplayName: string };

type NewFolderDialogState = null | { name: string };

type MoveFolderDialogState = null | { item: MediaItem; folderId: string | null };

type FolderRenameDialogState = null | { id: string; name: string };
type FolderMoveDialogState = null | { id: string; label: string; newParentId: string | null };
type FolderDeleteDialogState = null | { id: string; name: string };

function isDescendantOfFolder(flat: FolderRow[], ancestorId: string, nodeId: string): boolean {
  const byId = new Map(flat.map((f) => [f.id, f.parentId as string | null]));
  let cur: string | null = nodeId;
  for (let i = 0; i < 64 && cur; i += 1) {
    if (cur === ancestorId) return true;
    cur = byId.get(cur) ?? null;
  }
  return false;
}

function mediaTitle(item: MediaItem): string {
  return item.displayName?.trim() || item.filename;
}

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
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [s3DeleteQueueErrors, setS3DeleteQueueErrors] = useState<number | null>(null);
  const desktopUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mobileFilesInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, label: "Корень" }]);
  const [childFolders, setChildFolders] = useState<FolderRow[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [newFolderDialog, setNewFolderDialog] = useState<NewFolderDialogState>(null);
  const [moveFolderDialog, setMoveFolderDialog] = useState<MoveFolderDialogState>(null);
  const [allFoldersFlat, setAllFoldersFlat] = useState<FolderRow[]>([]);
  const [folderRenameDialog, setFolderRenameDialog] = useState<FolderRenameDialogState>(null);
  const [folderMoveDialog, setFolderMoveDialog] = useState<FolderMoveDialogState>(null);
  const [folderDeleteDialog, setFolderDeleteDialog] = useState<FolderDeleteDialogState>(null);
  const [foldersFlatForCrud, setFoldersFlatForCrud] = useState<FolderRow[]>([]);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const multipartSessionRef = useRef<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const currentFolderId = crumbs[crumbs.length - 1]?.id ?? null;

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    if (query.trim()) p.set("q", query.trim());
    if (currentFolderId === null) p.set("folderId", "root");
    else p.set("folderId", currentFolderId);
    return p.toString();
  }, [kind, sortBy, sortDir, query, currentFolderId]);

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
    setFoldersLoading(true);
    const parent = currentFolderId;
    const url =
      parent === null
        ? "/api/admin/media/folders"
        : `/api/admin/media/folders?parentId=${encodeURIComponent(parent)}`;
    fetch(url, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; items?: FolderRow[] };
        if (!res.ok || !data.ok) throw new Error("folders_failed");
        if (!cancelled) setChildFolders(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setChildFolders([]);
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentFolderId, reloadKey]);

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

  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void onLoadMoreRef.current();
      },
      { root: null, rootMargin: "400px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, reloadKey, searchParams]);

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

  function cancelActiveUpload() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    const sid = multipartSessionRef.current;
    multipartSessionRef.current = null;
    if (sid) void libraryMultipartAbort(sid);
  }

  async function uploadBatch(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadPercent(0);
    setUploadStatus(null);
    setError(null);
    multipartSessionRef.current = null;
    const ac = new AbortController();
    uploadAbortRef.current = ac;
    let useS3Multipart = false;
    try {
      const capRes = await fetch("/api/media/s3-status", { credentials: "same-origin", signal: ac.signal });
      const cap = (await capRes.json().catch(() => ({}))) as { s3Multipart?: boolean };
      useS3Multipart = Boolean(cap.s3Multipart);

      const totalBytes = files.reduce((acc, file) => acc + Math.max(file.size, 1), 0);
      let uploadedBytes = 0;
      for (let i = 0; i < files.length; i += 1) {
        if (ac.signal.aborted) {
          setUploadStatus("Загрузка отменена");
          break;
        }
        const file = files[i]!;
        setUploadStatus(`Файл ${i + 1}/${files.length}: ${file.name}`);
        const mime = (file.type || "application/octet-stream").toLowerCase();

        if (!useS3Multipart) {
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
        } else {
          multipartSessionRef.current = null;
          await libraryMultipartUpload({
            file,
            folderId: currentFolderId,
            signal: ac.signal,
            onSessionReady: (sid) => {
              multipartSessionRef.current = sid;
            },
            onProgress: (loaded) => {
              const next = Math.round(((uploadedBytes + loaded) / totalBytes) * 100);
              setUploadPercent(Math.max(0, Math.min(100, next)));
            },
          });
        }
        uploadedBytes += Math.max(file.size, 1);
        const next = Math.round((uploadedBytes / totalBytes) * 100);
        setUploadPercent(Math.max(0, Math.min(100, next)));
      }
      if (!ac.signal.aborted) {
        setUploadStatus(`Загрузка завершена: ${files.length} файлов`);
        setReloadKey((x) => x + 1);
      }
    } catch (e) {
      if (useS3Multipart && multipartSessionRef.current && !ac.signal.aborted) {
        void libraryMultipartAbort(multipartSessionRef.current);
      }
      if (ac.signal.aborted) {
        setError("Загрузка отменена");
      } else if (e instanceof UploadRequestError) {
        const payload = (e.data ?? {}) as { error?: string; filename?: string; retryable?: boolean };
        if (payload.filename) {
          setError(`Не удалось загрузить файл: ${payload.filename}`);
        } else if (payload.error === "network_error") {
          setError("Сетевая ошибка при загрузке");
        } else if (payload.error === "aborted") {
          setError("Загрузка отменена");
        } else if (payload.error === "integrity_mismatch") {
          setError("Файл не прошёл проверку целостности на сервере");
        } else if (payload.error === "session_expired") {
          setError("Сессия загрузки истекла — начните загрузку заново");
        } else if (payload.error === "session_state_conflict") {
          setError("Сессия загрузки в недопустимом состоянии — начните загрузку заново");
        } else if (payload.error === "session_not_found" || payload.error === "session_not_completable") {
          setError("Сессия загрузки устарела или закрыта — попробуйте снова");
        } else if (payload.error === "finalize_inconsistent_state") {
          setError("Сервер не смог завершить загрузку; попробуйте повторить или загрузить файл заново");
        } else if (payload.error === "finalize_failed" && payload.retryable) {
          setError("Временная ошибка сервера при завершении загрузки — попробуйте ещё раз");
        } else if (payload.error === "part_out_of_range") {
          setError("Сбой нумерации частей загрузки — попробуйте снова");
        } else if (payload.error === "missing_etag") {
          setError("Хранилище не вернуло ETag — проверьте CORS (Expose ETag) для MinIO");
        } else if (payload.error === "part_retry_exhausted") {
          setError("Не удалось загрузить часть файла после нескольких попыток");
        } else if (payload.error === "incomplete_parts") {
          setError("Загрузка прервана: не все части отправлены");
        } else {
          setError("Не удалось загрузить файл");
        }
      } else {
        setError("Не удалось загрузить файл");
      }
      if (!ac.signal.aborted) {
        setUploadStatus("Загрузка остановлена из-за ошибки");
      }
    } finally {
      uploadAbortRef.current = null;
      multipartSessionRef.current = null;
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

  function openRenameDialog(item: MediaItem) {
    setRenameDialog({
      item,
      nextDisplayName: item.displayName?.trim() || "",
    });
  }

  async function executeRename() {
    if (!renameDialog) return;
    const item = renameDialog.item;
    const nextDisplayName = renameDialog.nextDisplayName;
    setRenamingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/${item.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: nextDisplayName }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; displayName?: string | null };
      if (!res.ok || !data.ok) throw new Error("rename_failed");
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, displayName: data.displayName ?? null } : entry)),
      );
      setRenameDialog(null);
    } catch {
      setError("Не удалось переименовать файл");
    } finally {
      setRenamingId(null);
    }
  }

  async function executeCreateFolder() {
    if (!newFolderDialog) return;
    const name = newFolderDialog.name.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/admin/media/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не удалось создать папку");
        return;
      }
      setNewFolderDialog(null);
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось создать папку");
    }
  }

  async function loadFlatFoldersForMove() {
    try {
      const res = await fetch("/api/admin/media/folders?flat=true", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; items?: FolderRow[] };
      if (res.ok && data.ok) setAllFoldersFlat(data.items ?? []);
    } catch {
      setAllFoldersFlat([]);
    }
  }

  async function loadFlatFoldersForFolderCrud() {
    try {
      const res = await fetch("/api/admin/media/folders?flat=true", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; items?: FolderRow[] };
      if (res.ok && data.ok) setFoldersFlatForCrud(data.items ?? []);
    } catch {
      setFoldersFlatForCrud([]);
    }
  }

  function openFolderRename(folder: { id: string; name: string }) {
    setFolderRenameDialog({ id: folder.id, name: folder.name });
  }

  async function executeFolderRename() {
    if (!folderRenameDialog) return;
    const name = folderRenameDialog.name.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/folders/${folderRenameDialog.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError("Не удалось переименовать папку");
        return;
      }
      setFolderRenameDialog(null);
      setCrumbs((prev) => prev.map((c) => (c.id === folderRenameDialog.id ? { ...c, label: name } : c)));
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось переименовать папку");
    }
  }

  function openFolderMove(folder: { id: string; name: string }, currentParentId: string | null) {
    setFolderMoveDialog({ id: folder.id, label: folder.name, newParentId: currentParentId });
    void loadFlatFoldersForFolderCrud();
  }

  async function executeFolderMove() {
    if (!folderMoveDialog) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/folders/${folderMoveDialog.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: folderMoveDialog.newParentId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === "parent_not_found") {
          setError("Родительская папка не найдена или была удалена");
        } else if (data.error === "move_failed") {
          setError("Нельзя переместить папку (цикл или конфликт имён)");
        } else {
          setError("Не удалось переместить папку");
        }
        return;
      }
      setFolderMoveDialog(null);
      setReloadKey((x) => x + 1);
      setCrumbs([{ id: null, label: "Корень" }]);
    } catch {
      setError("Не удалось переместить папку");
    }
  }

  function openFolderDelete(folder: { id: string; name: string }) {
    setFolderDeleteDialog({ id: folder.id, name: folder.name });
  }

  async function executeFolderDelete() {
    if (!folderDeleteDialog) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/folders/${folderDeleteDialog.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === "not_empty") {
          setError("Папка не пустая — сначала удалите файлы и вложенные папки");
        } else {
          setError("Не удалось удалить папку");
        }
        return;
      }
      setFolderDeleteDialog(null);
      setCrumbs((prev) => {
        const idx = prev.findIndex((c) => c.id === folderDeleteDialog.id);
        if (idx >= 0) return prev.slice(0, idx);
        return prev;
      });
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось удалить папку");
    }
  }

  function openMoveFolderDialog(item: MediaItem) {
    setMoveFolderDialog({ item, folderId: item.folderId ?? null });
    void loadFlatFoldersForMove();
  }

  async function executeMoveToFolder() {
    if (!moveFolderDialog) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/${moveFolderDialog.item.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: moveFolderDialog.folderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Не удалось переместить файл");
        return;
      }
      const targetId = moveFolderDialog.folderId;
      const movedId = moveFolderDialog.item.id;
      setMoveFolderDialog(null);
      setItems((prev) => prev.map((x) => (x.id === movedId ? { ...x, folderId: targetId } : x)));
      setReloadKey((x) => x + 1);
    } catch {
      setError("Не удалось переместить файл");
    }
  }

  function resolutionText(item: MediaItem): string {
    if (item.kind !== "image" && item.kind !== "video") return "—";
    const w = item.sourceWidth;
    const h = item.sourceHeight;
    if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) return `${w}x${h}`;
    return "—";
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
                  Файл «{mediaTitle(deleteItem)}» сразу пропадёт из библиотеки; окончательное удаление из хранилища
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
      <Dialog
        open={renameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRenameDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={renamingId === null}>
          {renameDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Переименовать файл</DialogTitle>
                <DialogDescription>
                  Измените отображаемое название для библиотеки. Исходное имя файла в хранилище не меняется.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  value={renameDialog.nextDisplayName}
                  maxLength={180}
                  onChange={(e) => setRenameDialog((curr) => (curr ? { ...curr, nextDisplayName: e.target.value } : curr))}
                  placeholder={renameDialog.item.filename}
                  disabled={renamingId !== null}
                />
                <p className="text-xs text-muted-foreground">
                  Оставьте пустым, чтобы показывать исходное имя: {renameDialog.item.filename}
                </p>
              </div>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setRenameDialog(null)} disabled={renamingId !== null}>
                  Отмена
                </Button>
                <Button type="button" disabled={renamingId !== null} onClick={() => void executeRename()}>
                  {renamingId === renameDialog.item.id ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={newFolderDialog !== null}
        onOpenChange={(open) => {
          if (!open) setNewFolderDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Новая папка</DialogTitle>
            <DialogDescription>Создаётся в текущей папке: {crumbs[crumbs.length - 1]?.label ?? "Корень"}</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderDialog?.name ?? ""}
            maxLength={180}
            placeholder="Название"
            onChange={(e) => setNewFolderDialog((c) => (c ? { ...c, name: e.target.value } : c))}
          />
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setNewFolderDialog(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void executeCreateFolder()}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={moveFolderDialog !== null}
        onOpenChange={(open) => {
          if (!open) setMoveFolderDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          {moveFolderDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Переместить в папку</DialogTitle>
                <DialogDescription>Файл: {mediaTitle(moveFolderDialog.item)}</DialogDescription>
              </DialogHeader>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Папка</span>
                <select
                  className="h-10 rounded-md border border-input bg-background px-2"
                  value={moveFolderDialog.folderId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMoveFolderDialog((c) =>
                      c ? { ...c, folderId: v === "" ? null : v } : c,
                    );
                  }}
                >
                  <option value="">Корень</option>
                  {allFoldersFlat.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setMoveFolderDialog(null)}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => void executeMoveToFolder()}>
                  Переместить
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={folderRenameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setFolderRenameDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Переименовать папку</DialogTitle>
            <DialogDescription>Новое имя в текущей библиотеке</DialogDescription>
          </DialogHeader>
          <Input
            value={folderRenameDialog?.name ?? ""}
            maxLength={180}
            placeholder="Название"
            onChange={(e) => setFolderRenameDialog((c) => (c ? { ...c, name: e.target.value } : c))}
          />
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setFolderRenameDialog(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void executeFolderRename()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={folderMoveDialog !== null}
        onOpenChange={(open) => {
          if (!open) setFolderMoveDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          {folderMoveDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Переместить папку</DialogTitle>
                <DialogDescription>Папка: {folderMoveDialog.label}</DialogDescription>
              </DialogHeader>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Новый родитель</span>
                <select
                  className="h-10 rounded-md border border-input bg-background px-2"
                  value={folderMoveDialog.newParentId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFolderMoveDialog((c) => (c ? { ...c, newParentId: v === "" ? null : v } : c));
                  }}
                >
                  <option value="">Корень</option>
                  {foldersFlatForCrud
                    .filter(
                      (f) =>
                        f.id !== folderMoveDialog.id &&
                        !isDescendantOfFolder(foldersFlatForCrud, folderMoveDialog.id, f.id),
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setFolderMoveDialog(null)}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => void executeFolderMove()}>
                  Переместить
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={folderDeleteDialog !== null}
        onOpenChange={(open) => {
          if (!open) setFolderDeleteDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          {folderDeleteDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>Удалить папку?</DialogTitle>
                <DialogDescription>
                  Папка «{folderDeleteDialog.name}» удалится только если в ней нет файлов и вложенных папок.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setFolderDeleteDialog(null)}>
                  Отмена
                </Button>
                <Button type="button" variant="destructive" onClick={() => void executeFolderDelete()}>
                  Удалить
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

      <div className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
          {crumbs.map((c, idx) => (
            <span key={`${c.id ?? "root"}-${idx}`} className="inline-flex items-center gap-0.5">
              {idx > 0 ? <span aria-hidden>/</span> : null}
              <button
                type="button"
                className="rounded px-1 hover:bg-muted hover:text-foreground"
                onClick={() => setCrumbs(crumbs.slice(0, idx + 1))}
              >
                {c.label}
              </button>
              {c.id ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                    aria-label={`Действия: ${c.label}`}
                  >
                    <MoreHorizontal className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-44">
                    <DropdownMenuItem onClick={() => openFolderRename({ id: c.id!, name: c.label })}>
                      Переименовать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        openFolderMove({ id: c.id!, name: c.label }, crumbs[idx - 1]?.id ?? null)
                      }
                    >
                      Переместить…
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => openFolderDelete({ id: c.id!, name: c.label })}>
                      Удалить…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {foldersLoading ? (
            <span className="text-xs text-muted-foreground">Загрузка папок…</span>
          ) : (
            childFolders.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCrumbs([...crumbs, { id: f.id, label: f.name }])}
                >
                  {f.name}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                    aria-label={`Действия: ${f.name}`}
                  >
                    <MoreHorizontal className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-44">
                    <DropdownMenuItem onClick={() => openFolderRename({ id: f.id, name: f.name })}>
                      Переименовать
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openFolderMove({ id: f.id, name: f.name }, currentFolderId)}>
                      Переместить…
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => openFolderDelete({ id: f.id, name: f.name })}>
                      Удалить…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            ))
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setNewFolderDialog({ name: "" })}>
            Новая папка
          </Button>
        </div>
      </div>

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
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{uploadStatus ?? "Загрузка..."}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{uploadPercent}%</span>
              {uploading ? (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => cancelActiveUpload()}>
                  Отменить
                </Button>
              ) : null}
            </div>
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
                resolutionText={resolutionText(item)}
                onOpenPreview={() => openLightboxByItemId(item.id)}
                onDelete={() => openDeleteDialog(item)}
                onRename={() => openRenameDialog(item)}
                onMoveFolder={() => openMoveFolderDialog(item)}
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
              <div key={item.id} className="flex items-start gap-3 p-3">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={mediaTitle(item)}>
                  {mediaTitle(item)}
                </span>
                <MediaCardActionsMenu
                  triggerVariant="label"
                  item={item}
                  resolutionText={resolutionText(item)}
                  copied={copiedItemId === item.id}
                  deleting={deletingId === item.id}
                  onCopyUrl={() => void onCopyUrl(item)}
                  onRename={() => openRenameDialog(item)}
                  onMoveFolder={() => openMoveFolderDialog(item)}
                  onDelete={() => openDeleteDialog(item)}
                  onOpenPreview={() => openLightboxByItemId(item.id)}
                  formatSize={formatSize}
                  formatDate={formatDate}
                />
              </div>
            ))}
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Файлы не найдены</div>
            ) : null}
          </div>
        ) : (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Файл</th>
                  <th className="px-3 py-2">Просмотр</th>
                  <th className="sr-only px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="max-w-[22rem]">
                        <p className="truncate font-medium" title={mediaTitle(item)}>
                          {mediaTitle(item)}
                        </p>
                        {item.displayName?.trim() ? (
                          <p className="truncate text-xs text-muted-foreground" title={item.filename}>
                            Исходное имя: {item.filename}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {item.kind === "image" && canRenderInlineImage(item.mimeType) ? (
                        <TableMediaThumb item={item} onOpen={() => openLightboxByItemId(item.id)} />
                      ) : item.kind === "video" ? (
                        <TableMediaThumb item={item} onOpen={() => openLightboxByItemId(item.id)} />
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
                      <MediaCardActionsMenu
                        item={item}
                        resolutionText={resolutionText(item)}
                        copied={copiedItemId === item.id}
                        deleting={deletingId === item.id}
                        onCopyUrl={() => void onCopyUrl(item)}
                        onRename={() => openRenameDialog(item)}
                        onMoveFolder={() => openMoveFolderDialog(item)}
                        onDelete={() => openDeleteDialog(item)}
                        onOpenPreview={() => openLightboxByItemId(item.id)}
                        formatSize={formatSize}
                        formatDate={formatDate}
                      />
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
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
        <div className="flex flex-col items-center gap-2 py-3">
          {loadingMore ? <p className="text-xs text-muted-foreground">Загрузка…</p> : null}
          {!hasMore ? <p className="text-xs text-muted-foreground">Больше файлов нет</p> : null}
          {hasMore ? <div ref={loadMoreSentinelRef} className="h-1 w-full shrink-0" aria-hidden /> : null}
        </div>
      ) : null}
    </div>
  );
}
