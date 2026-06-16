"use client";

/**
 * PatientTabFiles — two-panel UI (list+filters / preview + actions).
 * Left: file list with category filters + list/cards view toggle + upload control.
 * Right: preview panel with Скачать · Открыть · Привязать к визиту (dropdown).
 *
 * Data: fetches from GET /api/doctor/patients/[userId]/files
 * Upload: POST /api/doctor/patients/[userId]/files → presigned PUT → fetch PUT to S3.
 * Link: PATCH /api/doctor/patients/[userId]/files/[fileId] { visitId }.
 * Visits: GET /api/doctor/patients/[userId]/clinical → visits[].
 *
 * «Единый источник с файлами визита»: files linked via visit_id are shown here too.
 *
 * Graceful fallback: if fetch fails or returns empty, renders empty state without crashing.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import type { PatientFileCategory } from "@/modules/patient-files/ports";
import { PATIENT_FILE_CATEGORIES } from "@/modules/patient-files/ports";
import type { Visit } from "@/modules/patient-clinical/ports";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import {
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorCatalogRowClass,
  doctorCatalogRowActiveClass,
} from "@/shared/ui/doctor/doctorVisual";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { CatalogLeftPane } from "@/shared/ui/doctor/catalog/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane";

// ---------------------------------------------------------------------------
// Types — match API response
// ---------------------------------------------------------------------------

type FileRecord = {
  id: string;
  patientUserId: string;
  category: PatientFileCategory;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  visitId: string | null;
  uploadedByUserId: string;
  createdAt: string; // ISO
  previewUrl: string | null; // presigned GET from API
};

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
    return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function categoryLabel(cat: PatientFileCategory): string {
  const map: Record<PatientFileCategory, string> = {
    выписка: "Выписка",
    снимок: "Снимок",
    анализ: "Анализ",
    фото_теста: "Фото теста",
    прочее: "Прочее",
  };
  return map[cat] ?? cat;
}

function fileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "📷";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("video/")) return "🎥";
  return "📎";
}

function visitLabel(v: Visit): string {
  const typeLabel = v.type === "first" ? "Первичный" : "Повторный";
  return `${v.date} · ${typeLabel}`;
}

type FileFilterCategory = "all" | PatientFileCategory;

// ---------------------------------------------------------------------------
// Category filter pills
// ---------------------------------------------------------------------------

function CategoryFilters({
  active,
  files,
  onChange,
}: {
  active: FileFilterCategory;
  files: FileRecord[];
  onChange: (c: FileFilterCategory) => void;
}) {
  const total = files.length;
  const counts = Object.fromEntries(
    PATIENT_FILE_CATEGORIES.map((cat) => [cat, files.filter((f) => f.category === cat).length]),
  ) as Record<PatientFileCategory, number>;

  return (
    <div className="flex flex-wrap gap-1 px-1 py-1">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "rounded-md px-2 py-0.5 text-xs font-medium transition-colors select-none",
          active === "all"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {`Все · ${total}`}
      </button>
      {PATIENT_FILE_CATEGORIES.map((cat) => {
        const count = counts[cat];
        if (count === 0) return null;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium transition-colors select-none",
              active === cat
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {`${categoryLabel(cat)} · ${count}`}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View toggle
// ---------------------------------------------------------------------------

type ViewMode = "list" | "cards";

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {(["list", "cards"] as ViewMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          title={m === "list" ? "Список" : "Карточки"}
          className={cn(
            "flex h-6 w-7 items-center justify-center rounded text-xs transition-colors select-none",
            mode === m
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "list" ? "☰" : "▦"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload panel
// ---------------------------------------------------------------------------

type UploadState =
  | { phase: "idle" }
  | { phase: "pending"; fileName: string; progress: number }
  | { phase: "error"; message: string };

function UploadPanel({
  userId,
  onUploaded,
  onClose,
}: {
  userId: string;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PatientFileCategory>("прочее");
  const [displayName, setDisplayName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });

  async function uploadSingleFile(file: File): Promise<void> {
    const fileName = displayName.trim() || file.name;

    setUploadState({ phase: "pending", fileName, progress: 0 });

    // Step 1: POST to create metadata + get presigned PUT url.
    let uploadUrl: string | null = null;
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          fileName,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        file?: FileRecord;
        uploadUrl?: string | null;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setUploadState({ phase: "error", message: data?.error ?? "Ошибка создания метаданных" });
        return;
      }

      uploadUrl = data.uploadUrl ?? null;
    } catch {
      setUploadState({ phase: "error", message: "Сетевая ошибка при создании записи" });
      return;
    }

    // Step 2: PUT the file to the presigned S3 URL (no auth headers — it's a presigned url).
    if (uploadUrl) {
      setUploadState({ phase: "pending", fileName, progress: 10 });
      try {
        const s3Res = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
        if (!s3Res.ok) {
          setUploadState({ phase: "error", message: `S3 ошибка: ${s3Res.status}` });
          return;
        }
        setUploadState({ phase: "pending", fileName, progress: 100 });
      } catch {
        setUploadState({ phase: "error", message: "Ошибка загрузки в S3" });
        return;
      }
    } else {
      // S3 not configured — metadata saved, no binary upload possible.
      // Treat as success (graceful: the record exists, file body not stored).
      setUploadState({ phase: "pending", fileName, progress: 100 });
    }
  }

  async function handleDroppedFiles(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      await uploadSingleFile(file);
    }
    onUploaded();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!displayName.trim()) setDisplayName(file.name);

    await uploadSingleFile(file);

    // Refresh list and close panel.
    onUploaded();
    onClose();
  }

  return (
    <div className="mx-1 mb-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Загрузить файл</span>
        <button
          type="button"
          onClick={() => { setDisplayName(""); onClose(); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={uploadState.phase === "pending"}
        >
          ✕
        </button>
      </div>

      {/* Category select */}
      <div className="flex items-center gap-2">
        <label htmlFor="upload-category" className="text-xs text-muted-foreground shrink-0">
          Категория
        </label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as PatientFileCategory)}
          disabled={uploadState.phase === "pending"}
        >
          <SelectTrigger
            className="flex-1 min-w-0 text-xs h-7"
            displayLabel={categoryLabel(category)}
          />
          <SelectContent>
            {PATIENT_FILE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabel(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filename input */}
      <div className="flex items-center gap-2">
        <label htmlFor="upload-display-name" className="text-xs text-muted-foreground shrink-0">
          Название
        </label>
        <input
          id="upload-display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Имя файла"
          disabled={uploadState.phase === "pending"}
          className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
        />
      </div>

      {/* File picker + drag-drop zone */}
      {uploadState.phase === "idle" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            id="upload-file-input"
            multiple
            className="sr-only"
            onChange={handleFileChange}
          />
          <label
            htmlFor="upload-file-input"
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                void handleDroppedFiles(files);
              }
            }}
            className={cn(
              "cursor-pointer flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-3 text-xs transition-colors",
              isDragOver
                ? "border-primary bg-primary/10 text-primary"
                : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
            )}
          >
            <span>{isDragOver ? "Отпустите файл…" : "Перетащите файл или нажмите для выбора"}</span>
            <span className="text-muted-foreground text-[10px]">Выбрать файл…</span>
          </label>
        </>
      )}

      {/* Upload progress */}
      {uploadState.phase === "pending" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground truncate">
            {uploadState.fileName}
          </span>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {uploadState.progress < 100 ? "Загрузка…" : "Завершено"}
          </span>
        </div>
      )}

      {/* Error state */}
      {uploadState.phase === "error" && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-destructive">{uploadState.message}</p>
          <button
            type="button"
            onClick={() => {
              setUploadState({ phase: "idle" });
              setDisplayName("");
              // Reset file input so the same file can be re-picked.
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="self-start text-xs text-primary hover:underline"
          >
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

function FileListRow({
  file,
  isActive,
  onClick,
}: {
  file: FileRecord;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        doctorCatalogRowClass,
        "w-full text-left items-start gap-2.5",
        isActive && doctorCatalogRowActiveClass,
      )}
    >
      <span className="text-base leading-tight shrink-0 mt-0.5">{fileIcon(file.mimeType)}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm text-foreground">{file.fileName}</div>
        <div className={cn(doctorSectionSubtitleClass, "text-xs mt-0.5")}>
          {categoryLabel(file.category)} · {formatDate(file.createdAt)}
          {file.visitId ? " · привязан к визиту" : " · без привязки"}
          {file.visitId && (
            <span className="ml-1.5 inline-flex items-center rounded bg-primary/8 px-1 py-px text-[10px] text-primary/70">
              из визита
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
        {formatBytes(file.sizeBytes)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card tile
// ---------------------------------------------------------------------------

function FileCardTile({
  file,
  isActive,
  userId,
  onClick,
  onRenamed,
}: {
  file: FileRecord;
  isActive: boolean;
  userId: string;
  onClick: () => void;
  onRenamed: (newName: string) => void;
}) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingName(file.fileName);
    setRenameError(null);
  }

  function cancelEdit() {
    setEditingName(null);
    setRenameError(null);
  }

  async function commitEdit() {
    if (editingName === null) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    if (trimmed === file.fileName) {
      cancelEdit();
      return;
    }
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (data?.ok) {
        onRenamed(trimmed);
        setEditingName(null);
        setRenameError(null);
      } else {
        setRenameError(data?.error ?? "Ошибка переименования");
      }
    } catch {
      setRenameError("Сетевая ошибка");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={editingName === null ? onClick : undefined}
      onKeyDown={(e) => {
        if (editingName === null && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors cursor-pointer overflow-hidden",
        isActive
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-background/60 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-2xl leading-none shrink-0">{fileIcon(file.mimeType)}</span>
        {editingName === null && (
          <button
            type="button"
            title="Переименовать"
            onClick={startEdit}
            className="shrink-0 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors leading-none mt-0.5"
            aria-label="Переименовать файл"
          >
            ✎
          </button>
        )}
      </div>
      <div className="min-w-0">
        {editingName !== null ? (
          <input
            type="text"
            value={editingName}
            autoFocus
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => void commitEdit()}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-primary/40 bg-background px-1 py-0.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        ) : (
          <div className="truncate text-xs font-medium text-foreground leading-snug">{file.fileName}</div>
        )}
        {renameError && (
          <div className="text-[10px] text-destructive mt-0.5 truncate">{renameError}</div>
        )}
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {categoryLabel(file.category)} · {formatDate(file.createdAt)}
        </div>
        <div className="text-[10px] text-muted-foreground">{formatBytes(file.sizeBytes)}</div>
      </div>
      {file.visitId && (
        <span className="self-start inline-flex items-center rounded bg-primary/8 px-1 py-px text-[10px] text-primary/70">
          из визита
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit selector dropdown (for «Привязать к визиту»)
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

  // Fetch visits on first open.
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

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handlePickVisit(visitId: string) {
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (data?.ok) {
        onLinked(visitId);
        setOpen(false);
      } else {
        setLinkError(data?.error ?? "Ошибка привязки");
      }
    } catch {
      setLinkError("Сетевая ошибка");
    } finally {
      setLinking(false);
    }
  }

  const currentVisitLabel =
    currentVisitId
      ? (visits.find((v) => v.id === currentVisitId) ? visitLabel(visits.find((v) => v.id === currentVisitId)!) : "Привязан к визиту")
      : null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        disabled={linking}
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-primary hover:underline transition-colors disabled:opacity-50 flex items-center gap-0.5"
        title="Привязать к визиту"
      >
        {linking
          ? "Привязка…"
          : currentVisitLabel
          ? `Визит: ${currentVisitLabel} ▾`
          : "Привязать к визиту ▾"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">Выберите визит</span>
          </div>
          {loadingVisits ? (
            <p className="px-3 py-3 text-xs text-muted-foreground animate-pulse">Загрузка визитов…</p>
          ) : visits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Визитов пока нет</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto py-1">
              {visits.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={linking || v.id === currentVisitId}
                    onClick={() => void handlePickVisit(v.id)}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs transition-colors",
                      v.id === currentVisitId
                        ? "bg-primary/10 text-primary font-medium cursor-default"
                        : "text-foreground hover:bg-muted disabled:opacity-50",
                    )}
                  >
                    {visitLabel(v)}
                    {v.id === currentVisitId && (
                      <span className="ml-1 text-[10px] text-primary/70">✓ текущий</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {linkError && (
            <p className="border-t border-border px-3 py-1.5 text-xs text-destructive">{linkError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview panel
// ---------------------------------------------------------------------------

function FilePreviewPanel({
  file,
  userId,
  onLinked,
}: {
  file: FileRecord | null;
  userId: string;
  onLinked?: (visitId: string) => void;
}) {
  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="text-3xl opacity-30">📁</span>
        <p className="text-sm text-muted-foreground">Выберите файл для предпросмотра</p>
      </div>
    );
  }

  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
        <span className="text-base leading-none shrink-0">{fileIcon(file.mimeType)}</span>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
          {file.fileName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {file.previewUrl && (
            <>
              <a
                href={file.previewUrl}
                download={file.fileName}
                className="text-xs text-primary hover:underline transition-colors"
                title="Скачать файл"
              >
                Скачать
              </a>
              <span className="text-muted-foreground/40 select-none">·</span>
              <a
                href={file.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline transition-colors"
                title="Открыть в новой вкладке"
              >
                Открыть
              </a>
              <span className="text-muted-foreground/40 select-none">·</span>
            </>
          )}
          <VisitSelector
            userId={userId}
            currentVisitId={file.visitId}
            fileId={file.id}
            onLinked={(visitId) => onLinked?.(visitId)}
          />
        </div>
      </div>

      {/* Preview area */}
      <div className="flex flex-1 items-center justify-center bg-[repeating-linear-gradient(45deg,hsl(var(--muted)/0.4),hsl(var(--muted)/0.4)_12px,hsl(var(--muted)/0.7)_12px,hsl(var(--muted)/0.7)_24px)] min-h-48 overflow-auto">
        {file.previewUrl && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.previewUrl}
            alt={file.fileName}
            className="max-w-full max-h-full object-contain"
          />
        ) : file.previewUrl && isPdf ? (
          <iframe
            src={file.previewUrl}
            title={file.fileName}
            className="w-full h-full min-h-[400px] border-0"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-background/80 px-6 py-4 text-center shadow-sm">
            <span className="text-4xl">{fileIcon(file.mimeType)}</span>
            <span className="text-xs text-muted-foreground">
              {file.previewUrl
                ? "Предпросмотр недоступен для этого типа файла"
                : "Предпросмотр доступен после загрузки файла в S3"}
            </span>
          </div>
        )}
      </div>

      {/* Footer meta */}
      <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          {categoryLabel(file.category)} · загружен {formatDate(file.createdAt)}
          {file.visitId ? " · привязан к визиту" : " · без привязки к визиту"}
          {" · "}
          {formatBytes(file.sizeBytes)}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Файлы из визитов отображаются здесь — единый источник с вкладкой «Карта».
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientTabFiles({
  userId,
  header: _header,
}: {
  userId: string;
  header?: PatientCardHeader;
}) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<FileFilterCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [showUpload, setShowUpload] = useState(false);

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
        // Auto-select first file if none selected.
        setSelectedFileId((prev) => prev ?? data.files?.[0]?.id ?? null);
      } else {
        setError(data?.error ?? "fetch_failed");
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const filteredFiles =
    activeCategory === "all"
      ? files
      : files.filter((f) => f.category === activeCategory);

  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;

  function handleSelectFile(file: FileRecord) {
    setSelectedFileId(file.id);
    setMobileView("detail");
  }

  function handleLinked(visitId: string) {
    // Optimistically update the selected file's visitId in state.
    setFiles((prev) =>
      prev.map((f) => (f.id === selectedFileId ? { ...f, visitId } : f)),
    );
  }

  function handleRenamed(fileId: string, newName: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, fileName: newName } : f)),
    );
  }

  function handleUploaded() {
    void loadFiles();
  }

  const leftPane = (
    <CatalogLeftPane
      stickySplit={false}
      headerSlot={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 py-1">
            <span className={cn(doctorSectionTitleClass, "flex-1")}>Файлы пациента</span>
            <button
              type="button"
              title="Загрузить файл"
              onClick={() => setShowUpload((v) => !v)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm transition-colors",
                showUpload
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              +
            </button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          <CategoryFilters
            active={activeCategory}
            files={files}
            onChange={setActiveCategory}
          />
        </div>
      }
    >
      {/* Upload panel — shown when + is toggled */}
      {showUpload && (
        <UploadPanel
          userId={userId}
          onUploaded={handleUploaded}
          onClose={() => setShowUpload(false)}
        />
      )}

      {loading ? (
        <p className="px-2 py-2 text-sm text-muted-foreground animate-pulse">Загрузка файлов…</p>
      ) : error ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          Не удалось загрузить файлы.{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => void loadFiles()}
          >
            Повторить
          </button>
        </p>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeCategory === "all"
              ? "Файлов пока нет. Перетащите файлы сюда или нажмите «Загрузить»."
              : "Нет файлов в этой категории."}
          </p>
        </div>
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-0.5 py-0.5">
          {filteredFiles.map((file) => (
            <FileListRow
              key={file.id}
              file={file}
              isActive={selectedFileId === file.id}
              onClick={() => handleSelectFile(file)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 py-1">
          {filteredFiles.map((file) => (
            <FileCardTile
              key={file.id}
              file={file}
              isActive={selectedFileId === file.id}
              userId={userId}
              onClick={() => handleSelectFile(file)}
              onRenamed={(newName) => handleRenamed(file.id, newName)}
            />
          ))}
        </div>
      )}
    </CatalogLeftPane>
  );

  const rightPane = (
    <CatalogRightPane contentClassName="px-0 py-0">
      <FilePreviewPanel
        file={selectedFile}
        userId={userId}
        onLinked={handleLinked}
      />
    </CatalogRightPane>
  );

  return (
    <div className="flex flex-col gap-3">
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={mobileView}
        mobileBackSlot={
          <button
            type="button"
            onClick={() => setMobileView("list")}
            className="mb-2 text-xs text-primary hover:underline"
          >
            ← Назад к списку файлов
          </button>
        }
      />
      <p className="text-xs text-muted-foreground px-0.5">
        Будущее: AI-разбор загруженных PDF (выписки, анализы) в структурированную историю.
      </p>
    </div>
  );
}
