'use client';

/**
 * PatientTabFiles — «Файлы и медиа» (FILES-01..11, 2026-09-04 mobile redesign).
 *
 * Fixed-height card with an internal scroll list; three header actions (камера, медиатека,
 * документ) trigger native browser capture/accept file inputs — no custom upload UI, no new
 * upload backend. Tap on a row opens the standard preview modal with real file info and the
 * existing actions (привязать к визиту, удалить).
 *
 * Data: fetches from GET /api/doctor/patients/[userId]/files
 * Upload: POST /api/doctor/patients/[userId]/files → presigned PUT → PUT to S3 → confirm.
 * Link: PATCH /api/doctor/patients/[userId]/files/[fileId] { visitId }.
 * Visits: GET /api/doctor/patients/[userId]/clinical → visits[].
 *
 * «Единый источник с файлами визита»: files linked via visit_id are shown here too.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FilePlus, Image as ImageIcon } from 'lucide-react';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
import type { PatientFileCategory } from '@/modules/patient-files/ports';
import type { Visit } from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorEmptyStateClass,
  doctorMetaTextClass,
} from '@/shared/ui/doctor/doctorVisual';

// ---------------------------------------------------------------------------
// Types — match API response
// ---------------------------------------------------------------------------

export type FileRecord = {
  id: string;
  patientUserId: string;
  category: PatientFileCategory;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  visitId: string | null;
  /** Non-null when this file is backed by a media library entry (PFI-ST-04/05). */
  mediaFileId: string | null;
  uploadedByUserId: string;
  createdAt: string; // ISO
  previewUrl: string | null; // presigned GET from API
};

/** Default category for files uploaded via the compact camera/library/document actions (FILES-04). */
const DEFAULT_UPLOAD_CATEGORY: PatientFileCategory = 'прочее';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function categoryLabel(cat: PatientFileCategory): string {
  const map: Record<PatientFileCategory, string> = {
    выписка: 'Выписка',
    снимок: 'Снимок',
    анализ: 'Анализ',
    фото_теста: 'Фото теста',
    прочее: 'Прочее',
  };
  return map[cat] ?? cat;
}

function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '📷';
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('video/')) return '🎥';
  return '📎';
}

function visitLabel(v: Visit): string {
  const typeLabel = v.type === 'first' ? 'Первичный' : 'Повторный';
  return `${v.date} · ${typeLabel}`;
}

function uploadErrorMessage(error: string | undefined): string {
  if (error === 'file_storage_limit_not_configured') {
    return 'Невозможно загрузить файл: у клиники нет действующего тарифа. Назначьте клинике тариф, чтобы загружать файлы.';
  }
  if (error === 'file_storage_limit_reached') {
    return 'Невозможно загрузить файл: хранилище клиники заполнено. Увеличьте объём файлов в тарифе клиники, чтобы загружать новые файлы.';
  }
  return error ?? 'Ошибка создания метаданных';
}

// ---------------------------------------------------------------------------
// Header actions — камера (Фото/Видео) · медиатека · документ (FILES-04..07)
// ---------------------------------------------------------------------------

type FilesHeaderActionsProps = {
  disabled: boolean;
  onPickFile: (file: File) => void;
};

/**
 * Три действия справа от заголовка. Все три — нативные `<input type="file">` с разным
 * accept/capture (браузерное поведение, без кастомного UI выбора): камера открывает
 * компактный выбор «Фото / Видео» и затем нужный capture-mode; медиатека — библиотека без
 * предложения камеры; документ — системный выбор файлов (без accept-фильтра под изображения).
 */
function FilesHeaderActions({ disabled, onPickFile }: FilesHeaderActionsProps) {
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPickFile(file);
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        ref={cameraPhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
      <input
        ref={cameraVideoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
      <input
        ref={documentRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          title="Камера"
          disabled={disabled}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <Camera className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => cameraPhotoRef.current?.click()}>Фото</DropdownMenuItem>
          <DropdownMenuItem onClick={() => cameraVideoRef.current?.click()}>Видео</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        title="Медиатека"
        disabled={disabled}
        onClick={() => libraryRef.current?.click()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ImageIcon className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        variant="ghost"
        title="Документ"
        disabled={disabled}
        onClick={() => documentRef.current?.click()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <FilePlus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

function FileListRow({ file, onClick }: { file: FileRecord; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60"
    >
      <span className="mt-0.5 shrink-0 text-base leading-tight">{fileIcon(file.mimeType)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{file.fileName}</div>
        <div className={cn(doctorMetaTextClass, 'mt-0.5')}>
          {categoryLabel(file.category)} · {formatDate(file.createdAt)}
          {file.visitId ? ' · привязан к визиту' : null}
        </div>
      </div>
      <span className={cn(doctorMetaTextClass, 'shrink-0')}>{formatBytes(file.sizeBytes)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Visit selector (for «Привязать к визиту») — unchanged contract
// ---------------------------------------------------------------------------

function VisitSelector({
  userId,
  currentVisitId,
  fileId,
  onLinked,
}: {
  userId: string;
  currentVisitId: string | null;
  fileId: string;
  onLinked: (visitId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || visits.length > 0) return;
    setLoadingVisits(true);
    fetch(`/api/doctor/patients/${userId}/clinical`)
      .then((r) => r.json().catch(() => null) as Promise<{ ok?: boolean; visits?: Visit[] } | null>)
      .then((data) => {
        if (data?.ok && Array.isArray(data.visits)) {
          setVisits(data.visits);
        }
      })
      .catch(() => {
        // Non-fatal: leave visits empty.
      })
      .finally(() => setLoadingVisits(false));
  }, [open, userId, visits.length]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handlePickVisit(visitId: string) {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (data?.ok) {
        onLinked(visitId);
        setOpen(false);
      } else {
        setLinkError(data?.error ?? 'Ошибка привязки');
      }
    } catch {
      setLinkError('Сетевая ошибка');
    } finally {
      setLinking(false);
    }
  }

  const currentVisitLabel = currentVisitId
    ? visits.find((v) => v.id === currentVisitId)
      ? visitLabel(visits.find((v) => v.id === currentVisitId)!)
      : 'Привязан к визиту'
    : null;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="ghost"
        disabled={linking}
        onClick={() => setOpen((o) => !o)}
        className="h-auto p-0 text-xs text-primary hover:underline disabled:opacity-50"
        title="Привязать к визиту"
      >
        {linking
          ? 'Привязка…'
          : currentVisitLabel
            ? `Визит: ${currentVisitLabel} ▾`
            : 'Привязать к визиту ▾'}
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">Выберите визит</span>
          </div>
          {loadingVisits ? (
            <p className="px-3 py-3 text-xs text-muted-foreground animate-pulse">
              Загрузка визитов…
            </p>
          ) : visits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Визитов пока нет</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {visits.map((v) => (
                <li key={v.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={linking || v.id === currentVisitId}
                    onClick={() => void handlePickVisit(v.id)}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs transition-colors',
                      v.id === currentVisitId
                        ? 'bg-primary/10 text-primary font-medium cursor-default'
                        : 'text-foreground hover:bg-muted disabled:opacity-50',
                    )}
                  >
                    {visitLabel(v)}
                    {v.id === currentVisitId && (
                      <span className="ml-1 text-[10px] text-primary/70">✓ текущий</span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {linkError && (
            <p className="border-t border-border px-3 py-1.5 text-xs text-destructive">
              {linkError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview modal (FILES-10) — standard DoctorModal, real file info + actions
// ---------------------------------------------------------------------------

function FilePreviewModal({
  file,
  userId,
  onClose,
  onLinked,
  onDeleteRequested,
}: {
  file: FileRecord | null;
  userId: string;
  onClose: () => void;
  onLinked: (visitId: string) => void;
  onDeleteRequested: (file: FileRecord) => void;
}) {
  const isImage = file?.mimeType.startsWith('image/') ?? false;
  const isPdf = file?.mimeType === 'application/pdf';

  return (
    <DoctorModal open={file !== null} onClose={onClose} title={file?.fileName ?? 'Файл'} size="lg">
      {file ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center overflow-hidden rounded-lg bg-[repeating-linear-gradient(45deg,hsl(var(--muted)/0.4),hsl(var(--muted)/0.4)_12px,hsl(var(--muted)/0.7)_12px,hsl(var(--muted)/0.7)_24px)]">
            {file.previewUrl && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.previewUrl}
                alt={file.fileName}
                className="max-h-[50vh] w-full object-contain"
              />
            ) : file.previewUrl && isPdf ? (
              <iframe
                src={file.previewUrl}
                title={file.fileName}
                className="h-[50vh] w-full border-0"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="text-4xl">{fileIcon(file.mimeType)}</span>
                <span className="text-xs text-muted-foreground">
                  {file.previewUrl
                    ? 'Предпросмотр недоступен для этого типа файла'
                    : 'Предпросмотр появится после загрузки файла'}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {categoryLabel(file.category)} · {formatDate(file.createdAt)} ·{' '}
              {formatBytes(file.sizeBytes)}
            </p>
            <VisitSelector
              userId={userId}
              currentVisitId={file.visitId}
              fileId={file.id}
              onLinked={onLinked}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {file.previewUrl && (
              <>
                <a
                  href={file.previewUrl}
                  download={file.fileName}
                  className="text-sm text-primary hover:underline"
                >
                  Скачать
                </a>
                <a
                  href={file.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Открыть
                </a>
              </>
            )}
            <Button
              type="button"
              variant="destructive"
              className="ml-auto h-8 px-3 text-xs"
              onClick={() => onDeleteRequested(file)}
            >
              Удалить
            </Button>
          </div>
        </div>
      ) : null}
    </DoctorModal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabFiles({
  userId,
  header: _header,
  initialFiles,
}: {
  userId: string;
  header?: PatientCardHeader;
  /** SSR-provided file list (no presigned URLs). When present, skips the initial client fetch. */
  initialFiles?: FileRecord[];
}) {
  const [files, setFiles] = useState<FileRecord[]>(() => initialFiles ?? []);
  const [loading, setLoading] = useState(initialFiles == null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [filePendingDelete, setFilePendingDelete] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteUsageCount, setDeleteUsageCount] = useState(0);
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files`);
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        files?: FileRecord[];
        error?: string;
      } | null;
      if (res.ok && data?.ok && Array.isArray(data.files)) {
        setFiles(data.files);
      } else {
        setError(data?.error ?? 'fetch_failed');
      }
    } catch {
      setError('network_error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (initialFiles != null) return;
    void loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewFile = files.find((f) => f.id === previewFileId) ?? null;

  async function uploadPickedFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: DEFAULT_UPLOAD_CATEGORY,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        file?: FileRecord;
        uploadUrl?: string | null;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok || !data.uploadUrl || !data.file?.id) {
        setUploadError(uploadErrorMessage(data?.error));
        return;
      }
      const pendingFileId = data.file.id;

      const s3Res = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!s3Res.ok) {
        setUploadError(`S3 ошибка: ${s3Res.status}`);
        return;
      }

      const confirmRes = await fetch(
        `/api/doctor/patients/${userId}/files/${pendingFileId}/confirm`,
        { method: 'POST' },
      );
      const confirm = (await confirmRes.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!confirmRes.ok || !confirm?.ok) {
        setUploadError(uploadErrorMessage(confirm?.error));
        return;
      }
      await loadFiles();
    } catch {
      setUploadError('Сетевая ошибка при загрузке файла');
    } finally {
      setUploading(false);
    }
  }

  function handleLinked(visitId: string) {
    setFiles((prev) => prev.map((f) => (f.id === previewFileId ? { ...f, visitId } : f)));
  }

  async function deleteSelectedFile(confirmUsed = false) {
    const file = filePendingDelete;
    if (!file) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const confirmUsedQuery = confirmUsed ? '?confirmUsed=true' : '';
      const response = await fetch(
        `/api/doctor/patients/${userId}/files/${file.id}${confirmUsedQuery}`,
        { method: 'DELETE' },
      );
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        usage?: unknown[];
      } | null;
      if (!response.ok || !data?.ok) {
        if (response.status === 409 && data?.error === 'media_in_use') {
          setDeleteUsageCount(Math.max(1, Array.isArray(data.usage) ? data.usage.length : 1));
          setDeleteError(null);
          return;
        }
        setDeleteError(
          data?.error === 'not_found'
            ? 'Файл уже удалён или недоступен.'
            : 'Не удалось удалить файл.',
        );
        return;
      }
      setFiles((previous) => previous.filter((item) => item.id !== file.id));
      setFilePendingDelete(null);
      setDeleteUsageCount(0);
      setPreviewFileId((current) => (current === file.id ? null : current));
      setDeletionNotice('Файл удалён. Место в хранилище освобождено.');
    } catch {
      setDeleteError('Сетевая ошибка. Файл не удалён.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cn(doctorSectionCardClass, 'h-full min-h-0 gap-2 overflow-hidden')}>
      <div className="flex items-center justify-between gap-2">
        <span className={doctorSectionTitleClass}>Файлы и медиа</span>
        <FilesHeaderActions disabled={uploading} onPickFile={(f) => void uploadPickedFile(f)} />
      </div>
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {deletionNotice && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {deletionNotice}
        </p>
      )}

      {/* FILES-09: fills whatever height PatientCardClient reserves for the active Files tab
          (flex-1 against the shared full-height tab-panel contract, PatientCardClient.tsx) —
          only this list scrolls, the card/page above never grows past its allotted space. */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground animate-pulse">
            Загрузка файлов…
          </p>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
            <p className="text-sm text-muted-foreground">Не удалось загрузить файлы.</p>
            <Button
              type="button"
              variant="ghost"
              className="h-auto p-0 text-sm text-primary hover:underline"
              onClick={() => void loadFiles()}
            >
              Повторить
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className={doctorEmptyStateClass}>Файлов нет</p>
          </div>
        ) : (
          files.map((file) => (
            <FileListRow key={file.id} file={file} onClick={() => setPreviewFileId(file.id)} />
          ))
        )}
      </div>

      <FilePreviewModal
        file={previewFile}
        userId={userId}
        onClose={() => setPreviewFileId(null)}
        onLinked={handleLinked}
        onDeleteRequested={(file) => {
          setFilePendingDelete(file);
          setDeleteError(null);
          setDeleteUsageCount(0);
        }}
      />

      <Dialog
        open={filePendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setFilePendingDelete(null);
            setDeleteError(null);
            setDeleteUsageCount(0);
          }
        }}
      >
        <DialogContent showCloseButton={!deleting} showOverlay={previewFile === null}>
          <DialogHeader>
            <DialogTitle>
              {deleteUsageCount > 0 ? 'Файл используется в материалах' : 'Удалить файл?'}
            </DialogTitle>
            <DialogDescription>
              {deleteUsageCount > 0
                ? `Найдено использований: ${deleteUsageCount}. После удаления связанные материалы перестанут показывать этот файл.`
                : `Файл «${filePendingDelete?.fileName ?? ''}» исчезнет из карты пациента, а удаление из хранилища будет безопасно завершено в фоне.`}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setFilePendingDelete(null);
                setDeleteUsageCount(0);
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteSelectedFile(deleteUsageCount > 0)}
            >
              {deleting
                ? 'Удаление…'
                : deleteUsageCount > 0
                  ? 'Удалить несмотря на использование'
                  : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
