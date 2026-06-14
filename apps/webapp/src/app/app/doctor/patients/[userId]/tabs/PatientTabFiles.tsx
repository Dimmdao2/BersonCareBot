"use client";

/**
 * PatientTabFiles — two-panel UI (list+filters / preview + actions).
 * Left: file list with category filters + list/cards view toggle.
 * Right: preview panel with Скачать · Открыть · Привязать к визиту actions.
 *
 * Data: fetches from GET /api/doctor/patients/[userId]/files
 * «Единый источник с файлами визита»: files linked via visit_id are shown here too.
 *
 * Graceful fallback: if fetch fails or returns empty, renders empty state without crashing.
 */

import { useState, useEffect, useCallback } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import type { PatientFileCategory } from "@/modules/patient-files/ports";
import { PATIENT_FILE_CATEGORIES } from "@/modules/patient-files/ports";
import { cn } from "@/lib/utils";
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
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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
        <div className="truncate text-sm font-medium text-foreground">{file.fileName}</div>
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
        "flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors cursor-pointer",
        isActive
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-background/60 hover:bg-muted/40",
      )}
    >
      <span className="text-2xl leading-none">{fileIcon(file.mimeType)}</span>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-foreground leading-snug">{file.fileName}</div>
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
    </button>
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
  const [linking, setLinking] = useState(false);

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

  const currentFileId = file.id;

  async function handleLinkToVisit() {
    // TODO(link-to-visit): show visit picker; for now prompt for visitId
    const visitId = window.prompt("UUID визита для привязки:");
    if (!visitId?.match(/^[0-9a-f-]{36}$/i)) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/files/${currentFileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (data?.ok && onLinked) onLinked(visitId);
    } catch {
      // Non-fatal.
    } finally {
      setLinking(false);
    }
  }

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
          <button
            type="button"
            disabled={linking}
            onClick={handleLinkToVisit}
            className="text-xs text-primary hover:underline transition-colors disabled:opacity-50"
            title="Привязать к визиту"
          >
            {linking ? "Привязка…" : "Привязать к визиту ▾"}
          </button>
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

  const leftPane = (
    <CatalogLeftPane
      stickySplit={false}
      headerSlot={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 py-1">
            <span className={cn(doctorSectionTitleClass, "flex-1")}>Файлы пациента</span>
            {/* TODO(upload): wire to presign POST + file picker */}
            <button
              type="button"
              title="Загрузить файл"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
        <p className="px-2 py-2 text-sm text-muted-foreground">
          {activeCategory === "all" ? "Файлов пока нет." : "Нет файлов в этой категории."}
        </p>
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
              onClick={() => handleSelectFile(file)}
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
