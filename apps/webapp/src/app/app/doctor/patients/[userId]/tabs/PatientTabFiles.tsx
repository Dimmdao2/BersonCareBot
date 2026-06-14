"use client";

/**
 * PatientTabFiles — Wave 3: two-panel UI (list+filters / preview + actions).
 * Left: file list with category filters + list/cards view toggle.
 * Right: preview panel with Скачать · Открыть · Привязать к визиту actions.
 * NOTE: «единый источник с файлами визита» — files uploaded in visit cards appear here too.
 *
 * TODO(backend): files model + upload/preview/link-to-visit API (Wave 4)
 * TODO(backend): replace MOCK_FILES with real fetch by userId
 * TODO(backend): upload button wires to real S3 upload endpoint
 * TODO(backend): "Привязать к визиту" wires to real visit-link mutation
 */

import { useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
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
// Types
// ---------------------------------------------------------------------------

type FileCategory = "all" | "выписка" | "снимок" | "анализ" | "фото_теста" | "прочее";

type MockFile = {
  id: string;
  name: string;
  category: Exclude<FileCategory, "all">;
  date: string; // DD.MM.YYYY
  /** Optional visit date this file is linked to */
  linkedVisitDate?: string; // DD.MM.YYYY
  sizeLabel: string;
  icon: string;
  /** Source: "patient" = uploaded standalone; "visit" = came from a visit card */
  source: "patient" | "visit";
};

// ---------------------------------------------------------------------------
// Mock data — realistic Russian patient file entries
// TODO(backend): replace with real files model + fetch
// ---------------------------------------------------------------------------

const MOCK_FILES: MockFile[] = [
  {
    id: "f1",
    name: "МРТ_поясница_окт2025.pdf",
    category: "снимок",
    date: "14.10.2025",
    linkedVisitDate: "05.01.2026",
    sizeLabel: "18 МБ",
    icon: "🩻",
    source: "visit",
  },
  {
    id: "f2",
    name: "Выписка_невролог_дек2025.pdf",
    category: "выписка",
    date: "28.12.2025",
    sizeLabel: "2.4 МБ",
    icon: "📄",
    source: "patient",
  },
  {
    id: "f3",
    name: "тест_наклона_22-01.jpg",
    category: "фото_теста",
    date: "22.01.2026",
    linkedVisitDate: "22.01.2026",
    sizeLabel: "1.1 МБ",
    icon: "📷",
    source: "visit",
  },
  {
    id: "f4",
    name: "ОАК_янв2026.pdf",
    category: "анализ",
    date: "11.01.2026",
    sizeLabel: "340 КБ",
    icon: "🧪",
    source: "patient",
  },
  {
    id: "f5",
    name: "Выписка_кардиолог_фев2026.pdf",
    category: "выписка",
    date: "03.02.2026",
    linkedVisitDate: "10.02.2026",
    sizeLabel: "1.8 МБ",
    icon: "📄",
    source: "visit",
  },
  {
    id: "f6",
    name: "рентген_шея_мар2026.jpg",
    category: "снимок",
    date: "17.03.2026",
    sizeLabel: "5.2 МБ",
    icon: "🩻",
    source: "patient",
  },
];

// ---------------------------------------------------------------------------
// Category filter config
// ---------------------------------------------------------------------------

type CategoryOption = { value: FileCategory; label: string };

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: "all", label: `Все · ${MOCK_FILES.length}` },
  { value: "выписка", label: "Выписки" },
  { value: "снимок", label: "Снимки" },
  { value: "анализ", label: "Анализы" },
  { value: "фото_теста", label: "Фото тестов" },
  { value: "прочее", label: "Прочее" },
];

function categoryLabel(cat: Exclude<FileCategory, "all">): string {
  const map: Record<Exclude<FileCategory, "all">, string> = {
    выписка: "Выписка",
    снимок: "Снимок",
    анализ: "Анализ",
    фото_теста: "Фото теста",
    прочее: "Прочее",
  };
  return map[cat];
}

// ---------------------------------------------------------------------------
// Sub-components
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

function CategoryFilters({
  active,
  files,
  onChange,
}: {
  active: FileCategory;
  files: MockFile[];
  onChange: (c: FileCategory) => void;
}) {
  const counts: Record<FileCategory, number> = {
    all: files.length,
    выписка: files.filter((f) => f.category === "выписка").length,
    снимок: files.filter((f) => f.category === "снимок").length,
    анализ: files.filter((f) => f.category === "анализ").length,
    фото_теста: files.filter((f) => f.category === "фото_теста").length,
    прочее: files.filter((f) => f.category === "прочее").length,
  };

  return (
    <div className="flex flex-wrap gap-1 px-1 py-1">
      {CATEGORY_OPTIONS.map(({ value, label }) => {
        const count = value === "all" ? counts.all : counts[value];
        if (value !== "all" && count === 0) return null;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium transition-colors select-none",
              active === value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {value === "all" ? `Все · ${count}` : `${label} · ${count}`}
          </button>
        );
      })}
    </div>
  );
}

function FileListRow({
  file,
  isActive,
  onClick,
}: {
  file: MockFile;
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
      <span className="text-base leading-tight shrink-0 mt-0.5">{file.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
        <div className={cn(doctorSectionSubtitleClass, "text-xs mt-0.5")}>
          {categoryLabel(file.category)} · {file.date}
          {file.linkedVisitDate ? ` · визит ${file.linkedVisitDate}` : " · без привязки"}
          {file.source === "visit" && (
            <span className="ml-1.5 inline-flex items-center rounded bg-primary/8 px-1 py-px text-[10px] text-primary/70">
              из визита
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{file.sizeLabel}</span>
    </button>
  );
}

function FileCardTile({ file, isActive, onClick }: { file: MockFile; isActive: boolean; onClick: () => void }) {
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
      <span className="text-2xl leading-none">{file.icon}</span>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-foreground leading-snug">{file.name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {categoryLabel(file.category)} · {file.date}
        </div>
        <div className="text-[10px] text-muted-foreground">{file.sizeLabel}</div>
      </div>
      {file.source === "visit" && (
        <span className="self-start inline-flex items-center rounded bg-primary/8 px-1 py-px text-[10px] text-primary/70">
          из визита
        </span>
      )}
    </button>
  );
}

function FilePreviewPanel({ file }: { file: MockFile | null }) {
  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="text-3xl opacity-30">📁</span>
        <p className="text-sm text-muted-foreground">Выберите файл для предпросмотра</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header with file name + actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
        <span className="text-base leading-none shrink-0">{file.icon}</span>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
          {file.name}
        </span>
        {/* TODO(backend): wire Скачать / Открыть / Привязать к визиту to real file URLs & mutations */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="text-xs text-primary hover:underline transition-colors"
            title="Скачать файл"
          >
            Скачать
          </button>
          <span className="text-muted-foreground/40 select-none">·</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline transition-colors"
            title="Открыть в новой вкладке"
          >
            Открыть
          </button>
          <span className="text-muted-foreground/40 select-none">·</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline transition-colors"
            title="Привязать к визиту"
          >
            Привязать к визиту ▾
          </button>
        </div>
      </div>

      {/* Preview area — mock placeholder (real: iframe/img based on mime) */}
      {/* TODO(backend): real preview: <img> for images, <iframe> for PDFs, doc viewer otherwise */}
      <div className="flex flex-1 items-center justify-center bg-[repeating-linear-gradient(45deg,hsl(var(--muted)/0.4),hsl(var(--muted)/0.4)_12px,hsl(var(--muted)/0.7)_12px,hsl(var(--muted)/0.7)_24px)] min-h-48">
        <div className="flex flex-col items-center gap-2 rounded-lg bg-background/80 px-6 py-4 text-center shadow-sm">
          <span className="text-4xl">{file.icon}</span>
          <span className="text-xs text-muted-foreground">Предпросмотр: изображение / PDF / документ</span>
          <span className="text-[10px] text-muted-foreground/60">(доступен после подключения бэкенда)</span>
        </div>
      </div>

      {/* Footer with meta */}
      <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          {categoryLabel(file.category)} · загружен {file.date}
          {file.linkedVisitDate ? ` · привязан к визиту ${file.linkedVisitDate}` : " · без привязки к визиту"}
          {" · "}
          {file.sizeLabel}
        </p>
        {/* единый источник с файлами визита badge */}
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
  userId: _userId,
  header: _header,
}: {
  userId: string;
  header?: PatientCardHeader;
}) {
  const [activeCategory, setActiveCategory] = useState<FileCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(MOCK_FILES[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // TODO(backend): replace with real files fetch for _userId
  const allFiles = MOCK_FILES;

  const filteredFiles =
    activeCategory === "all" ? allFiles : allFiles.filter((f) => f.category === activeCategory);

  const selectedFile = allFiles.find((f) => f.id === selectedFileId) ?? null;

  function handleSelectFile(file: MockFile) {
    setSelectedFileId(file.id);
    setMobileView("detail");
  }

  const leftPane = (
    <CatalogLeftPane
      stickySplit={false}
      headerSlot={
        <div className="flex flex-col gap-1">
          {/* Header row: title + upload CTA + view toggle */}
          <div className="flex items-center gap-2 py-1">
            <span className={cn(doctorSectionTitleClass, "flex-1")}>Файлы пациента</span>
            {/* TODO(backend): wire to real upload endpoint */}
            <button
              type="button"
              title="Загрузить файл"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              +
            </button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          {/* Category filter pills */}
          <CategoryFilters
            active={activeCategory}
            files={allFiles}
            onChange={setActiveCategory}
          />
        </div>
      }
    >
      {filteredFiles.length === 0 ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          Нет файлов в этой категории.
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
      <FilePreviewPanel file={selectedFile} />
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
