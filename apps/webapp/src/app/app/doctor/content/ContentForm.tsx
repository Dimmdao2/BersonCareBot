"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { MarkdownEditorToastUi } from "@/shared/ui/doctor/markdown/MarkdownEditorToastUi";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import {
  HELP_CANONICAL_ARTICLE_IA,
  HELP_CANONICAL_ARTICLE_SLUGS,
} from "@/modules/help-content/canonicalSlugs";
import { HELP_SECTION_SLUG } from "@/modules/content-sections/types";
import type { PatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
import { ruRatingCountLabel } from "@/shared/lib/ruRatingCountLabel";
import { MediaLibraryPickerDialog } from "./MediaLibraryPickerDialog";
import { ContentPreview } from "./ContentPreview";
import { saveContentPage, type SaveContentPageState } from "./actions";

type ContentPage = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  requiresAuth: boolean;
  videoUrl: string | null;
  imageUrl?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  linkedCourseId?: string | null;
};

export type PublishedCourseOption = { id: string; title: string };

// ─── native-select style reused for both Раздел and Связан с курсом selects ────
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── shared field-label style (mirrors existing span labels) ─────────────────
const fieldLabelClass = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export function ContentForm({
  page,
  sections,
  publishedCourses = [],
  patientHomeContext,
  materialRatingSummary,
  /** При создании страницы: slug раздела из query (`?section=`), если есть в списке разделов. */
  initialSectionSlug,
  /** Если один допустимый раздел в контексте — скрыть выбор и отправить hidden `section`. */
  sectionSelectReadOnly,
  /**
   * Если передан — показывает кнопку «← к списку» вверху главной колонки.
   * При dirty-состоянии спрашивает подтверждение перед уходом.
   * Не передаётся в полностраничных роутах (/edit/[id], /new).
   */
  onBack,
  /**
   * Compact sidebar: уже ~260px вместо 340px; чуть теснее gaps.
   * Используется в inline-pane (ContentEditorRightPane).
   * По умолчанию false — полностраничные роуты не меняются.
   */
  compact = false,
}: {
  page?: ContentPage;
  sections: ContentSectionRow[];
  publishedCourses?: PublishedCourseOption[];
  patientHomeContext?: PatientHomeCmsReturnQuery;
  materialRatingSummary?: { avg: number | null; count: number } | null;
  initialSectionSlug?: string | null;
  sectionSelectReadOnly?: boolean;
  onBack?: () => void;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveContentPage, null as SaveContentPageState | null);
  const isNew = !page;

  // ─── recordKey: changes when the edited record changes ────────────────────
  const recordKey = page?.id ?? "create";

  // ─── derived initial section ──────────────────────────────────────────────
  const defaultSectionSlugForSelect =
    page?.section ??
    (initialSectionSlug && sections.some((s) => s.slug === initialSectionSlug)
      ? initialSectionSlug
      : sections[0]?.slug ?? "");

  const readOnlySection =
    !page &&
    Boolean(sectionSelectReadOnly) &&
    sections.length === 1 &&
    Boolean(defaultSectionSlugForSelect);

  const isHelpSectionContext =
    defaultSectionSlugForSelect === HELP_SECTION_SLUG || page?.section === HELP_SECTION_SLUG;

  // ─── state for controlled fields (needed for dirty detection + preview) ───
  const initialBodyMd = page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : "";

  const [titleValue, setTitleValue] = useState(page?.title ?? "");
  const [summaryValue, setSummaryValue] = useState(page?.summary ?? "");
  const [bodyMdValue, setBodyMdValue] = useState(initialBodyMd);
  const [slugValue, setSlugValue] = useState(page?.slug ?? "");
  const [imageUrlValue, setImageUrlValue] = useState(page?.imageUrl ?? "");
  const [videoUrlValue, setVideoUrlValue] = useState(page?.videoUrl ?? "");
  const [isPublishedValue, setIsPublishedValue] = useState(page?.isPublished ?? true);
  const [requiresAuthValue, setRequiresAuthValue] = useState(page?.requiresAuth ?? false);
  const [sectionValue, setSectionValue] = useState(defaultSectionSlugForSelect);
  const [linkedCourseIdValue, setLinkedCourseIdValue] = useState(page?.linkedCourseId ?? "");

  const [previewOpen, setPreviewOpen] = useState(false);
  const slugManualRef = useRef(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isPublishedHiddenRef = useRef<HTMLInputElement>(null);

  // ─── baseline snapshot for dirty detection ────────────────────────────────
  const baselineRef = useRef({
    title: page?.title ?? "",
    summary: page?.summary ?? "",
    bodyMd: initialBodyMd,
    slug: page?.slug ?? "",
    imageUrl: page?.imageUrl ?? "",
    videoUrl: page?.videoUrl ?? "",
    isPublished: page?.isPublished ?? true,
    requiresAuth: page?.requiresAuth ?? false,
    section: defaultSectionSlugForSelect,
    linkedCourseId: page?.linkedCourseId ?? "",
  });

  // ─── record-keyed reset (ExerciseForm pattern) ────────────────────────────
  useEffect(() => {
    const newBodyMd = page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : "";
    const newSection =
      page?.section ??
      (initialSectionSlug && sections.some((s) => s.slug === initialSectionSlug)
        ? initialSectionSlug
        : sections[0]?.slug ?? "");

    setTitleValue(page?.title ?? "");
    setSummaryValue(page?.summary ?? "");
    setBodyMdValue(newBodyMd);
    setSlugValue(page?.slug ?? "");
    setImageUrlValue(page?.imageUrl ?? "");
    setVideoUrlValue(page?.videoUrl ?? "");
    setIsPublishedValue(page?.isPublished ?? true);
    setRequiresAuthValue(page?.requiresAuth ?? false);
    setSectionValue(newSection);
    setLinkedCourseIdValue(page?.linkedCourseId ?? "");
    slugManualRef.current = false;

    // reset dirty baseline
    baselineRef.current = {
      title: page?.title ?? "",
      summary: page?.summary ?? "",
      bodyMd: newBodyMd,
      slug: page?.slug ?? "",
      imageUrl: page?.imageUrl ?? "",
      videoUrl: page?.videoUrl ?? "",
      isPublished: page?.isPublished ?? true,
      requiresAuth: page?.requiresAuth ?? false,
      section: newSection,
      linkedCourseId: page?.linkedCourseId ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- full reset only on record identity change
  }, [recordKey]);

  // ─── reset dirty baseline after successful save ───────────────────────────
  useEffect(() => {
    if (!state?.ok) return;
    baselineRef.current = {
      title: titleValue,
      summary: summaryValue,
      bodyMd: bodyMdValue,
      slug: slugValue,
      imageUrl: imageUrlValue,
      videoUrl: videoUrlValue,
      isPublished: isPublishedValue,
      requiresAuth: requiresAuthValue,
      section: sectionValue,
      linkedCourseId: linkedCourseIdValue,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs only when state.ok flips
  }, [state?.ok]);

  // ─── scroll banner into view on save result ───────────────────────────────
  useEffect(() => {
    if (state?.ok || state?.error) {
      // scrollIntoView is not available in jsdom; guard for test environments
      if (typeof bannerRef.current?.scrollIntoView === "function") {
        bannerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [state]);

  // ─── dirty detection ──────────────────────────────────────────────────────
  const b = baselineRef.current;
  const isDirty =
    titleValue !== b.title ||
    summaryValue !== b.summary ||
    bodyMdValue !== b.bodyMd ||
    slugValue !== b.slug ||
    (imageUrlValue ?? "") !== (b.imageUrl ?? "") ||
    (videoUrlValue ?? "") !== (b.videoUrl ?? "") ||
    isPublishedValue !== b.isPublished ||
    requiresAuthValue !== b.requiresAuth ||
    sectionValue !== b.section ||
    (linkedCourseIdValue ?? "") !== (b.linkedCourseId ?? "");

  // ─── beforeunload guard ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ─── empty state ─────────────────────────────────────────────────────────
  if (!page && sections.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">Нет разделов в базе. Сначала создайте раздел.</p>
        <Link href="/app/doctor/content/sections" className="text-primary underline">
          Управление разделами
        </Link>
      </div>
    );
  }

  // ─── onBack with dirty guard ──────────────────────────────────────────────
  const handleBack = () => {
    if (!onBack) return;
    if (isDirty) {
      if (!window.confirm("Есть несохранённые изменения. Уйти без сохранения?")) return;
    }
    onBack();
  };

  // ─── save button disabled logic ───────────────────────────────────────────
  const saveDisabled = pending || (!isDirty && !isNew);

  // ─── derived grid/gap classes based on compact prop ─────────────────────
  const gridColsClass = compact
    ? "lg:grid-cols-[minmax(0,1fr)_260px]"
    : "lg:grid-cols-[minmax(0,1fr)_340px]";
  const gapXClass = compact ? "gap-x-4" : "gap-x-6";
  const colGapClass = compact ? "gap-4" : "gap-5";

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-0"
      onInput={(e) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (!target) return;
        if (target.name === "title") setTitleValue(target.value);
        if (target.name === "summary") setSummaryValue(target.value);
        if (target.name === "body_md") setBodyMdValue(target.value);
        if (target.name === "section") setSectionValue(target.value);
        if (target.name === "linked_course_id") setLinkedCourseIdValue(target.value);
      }}
    >
      {/* Two-column grid: left = main content, right = sidebar */}
      <div className={`grid grid-cols-1 gap-y-6 ${gapXClass} ${gridColsClass}`}>

        {/* ── MAIN COLUMN ─────────────────────────────────────────────────── */}
        <div className={`flex flex-col ${colGapClass}`}>

          {/* Header row: optional back button + publish status chip (#8).
               Always rendered — chip is always visible; back button only in inline mode. */}
          <div className="flex items-center justify-between gap-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
                ← к списку
              </Button>
            ) : (
              <span />
            )}
            {/* #8 — Publish-status chip: green when published, muted when draft */}
            {isPublishedValue ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Опубликовано
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Черновик
              </span>
            )}
          </div>

          {/* Rating summary (edit mode) */}
          {page && materialRatingSummary ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {materialRatingSummary.count === 0
                ? "Пациенты ещё не оценили материал."
                : `Оценки пациентов: средняя ${materialRatingSummary.avg != null ? materialRatingSummary.avg.toFixed(1) : "—"}, ${materialRatingSummary.count} ${ruRatingCountLabel(materialRatingSummary.count)}.`}
            </p>
          ) : null}

          {/* Hidden page_id */}
          {page ? <input type="hidden" name="page_id" value={page.id} /> : null}

          {/* Заголовок */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content-title" className={fieldLabelClass}>Заголовок</Label>
            {isNew ? (
              <Input
                id="content-title"
                type="text"
                name="title"
                required
                value={titleValue}
                onChange={(e) => {
                  const t = e.target.value;
                  setTitleValue(t);
                  if (!slugManualRef.current) {
                    const s = slugFromTitle(t);
                    setSlugValue(s ?? fallbackSlug());
                  }
                }}
              />
            ) : (
              <Input
                id="content-title"
                type="text"
                name="title"
                required
                defaultValue={page?.title ?? ""}
                key={`title-${page?.id ?? "new"}`}
                onChange={(e) => setTitleValue(e.target.value)}
              />
            )}
          </div>

          {/* Раздел + Slug side-by-side */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Раздел */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="content-section" className={fieldLabelClass}>Раздел</Label>
              {readOnlySection ? (
                <>
                  <input type="hidden" name="section" value={defaultSectionSlugForSelect} />
                  <p className="text-sm text-foreground">
                    {sections.find((s) => s.slug === defaultSectionSlugForSelect)?.title ?? defaultSectionSlugForSelect}
                  </p>
                  <p className="text-xs text-muted-foreground">Раздел задан контекстом страницы создания.</p>
                </>
              ) : (
                <select
                  id="content-section"
                  name="section"
                  required
                  className={selectClass}
                  defaultValue={defaultSectionSlugForSelect}
                  key={page ? `section-${page.id}` : `section-new-${defaultSectionSlugForSelect}`}
                >
                  {sections.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              {isHelpSectionContext ? (
                <p className="text-xs text-muted-foreground">
                  Канонические slug (плитки — после публикации; чеклист: `help-content/CMS_EDITOR_CHECKLIST.md`):{" "}
                  {HELP_CANONICAL_ARTICLE_SLUGS.map(
                    (s) => `${s} — ${HELP_CANONICAL_ARTICLE_IA[s].title}`,
                  ).join("; ")}
                  .
                </p>
              ) : null}
            </div>

            {/* Slug */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="content-slug" className={fieldLabelClass}>Slug</Label>
              {isNew ? (
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="content-slug"
                    type="text"
                    name="slug"
                    required
                    className="min-w-[8rem] flex-1"
                    value={slugValue}
                    onChange={(e) => {
                      slugManualRef.current = true;
                      setSlugValue(e.target.value);
                    }}
                    pattern="[a-z0-9-]+"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start"
                    onClick={() => {
                      slugManualRef.current = false;
                      const s = slugFromTitle(titleValue);
                      setSlugValue(s ?? fallbackSlug());
                    }}
                  >
                    Сгенерировать
                  </Button>
                </div>
              ) : (
                <Input
                  id="content-slug"
                  type="text"
                  name="slug"
                  required
                  value={slugValue}
                  onChange={(e) => setSlugValue(e.target.value)}
                  pattern="[a-z0-9-]+"
                />
              )}
            </div>
          </div>

          {/* Краткое описание + counter */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="content-summary" className={fieldLabelClass}>Краткое описание</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {summaryValue.length}/2000
              </span>
            </div>
            <Textarea
              id="content-summary"
              name="summary"
              rows={2}
              defaultValue={page?.summary ?? ""}
              key={`summary-${page?.id ?? "new"}`}
              onChange={(e) => setSummaryValue(e.target.value)}
            />
          </div>

          {/* Содержимое (markdown editor) */}
          <MarkdownEditorToastUi
            name="body_md"
            defaultValue={
              page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : ""
            }
            key={`body-${page?.id ?? "new"}`}
            onValueChange={setBodyMdValue}
          />

          {/* #4 — Hidden is_published.
               Uncontrolled so we can set .value synchronously in publish/unpublish handlers
               before requestSubmit() — React state (isPublishedValue) drives the chip + dirty
               detection; the DOM value is the authoritative FormData source.
               FormData field name is unchanged; saveContentPage is NOT touched. */}
          <input
            ref={isPublishedHiddenRef}
            type="hidden"
            name="is_published"
            key={`pub-hidden-${page?.id ?? "new"}`}
            defaultValue={isPublishedValue ? "on" : ""}
          />

          {/* Requires-auth checkbox stays as-is */}
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                name="requires_auth"
                defaultChecked={page?.requiresAuth ?? false}
                key={`req-${page?.id ?? "new"}`}
                onChange={(e) => setRequiresAuthValue(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className={fieldLabelClass}>Только для залогиненных (щит)</span>
            </label>
          </div>
        </div>
        {/* ── END MAIN COLUMN ─────────────────────────────────────────────── */}

        {/* ── SIDEBAR COLUMN ──────────────────────────────────────────────── */}
        <div className={`flex flex-col ${colGapClass}`}>
          {/* Sticky wrapper keeps sidebar in view while main column scrolls */}
          <div className={`lg:sticky lg:top-4 flex flex-col ${colGapClass}`}>

            {/* Error / success banner — at the top of sidebar for visibility after scroll */}
            <div ref={bannerRef}>
              {state?.error ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {state.error}
                </p>
              ) : null}
              {state?.ok ? (
                patientHomeContext ? (
                  <div role="status" className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
                    <p className="font-medium">Страница сохранена</p>
                    <p className="mt-1 text-muted-foreground">
                      Вернитесь на экран главной пациента и добавьте материал в блок «{patientHomeContext.patientHomeBlock}».
                    </p>
                    <Link href={patientHomeContext.returnTo} className="mt-2 inline-flex text-primary underline">
                      Открыть экран «Главная пациента»
                    </Link>
                  </div>
                ) : (
                  <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    Сохранено
                  </p>
                )
              ) : null}
            </div>

            {/* #4 — Save / Publish separation bar.
                 «Сохранить» submits with current isPublishedValue unchanged.
                 «Опубликовать» sets isPublishedValue=true then submits.
                 «Снять с публикации» sets isPublishedValue=false then submits.
                 Hidden is_published input (in main column) reflects isPublishedValue.
                 saveContentPage + FormData field names are untouched. */}
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={saveDisabled} className="w-full">
                {pending ? "Сохранение…" : "Сохранить"}
              </Button>
              {isPublishedValue ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    // Set DOM value synchronously so FormData picks it up on submit
                    if (isPublishedHiddenRef.current) isPublishedHiddenRef.current.value = "";
                    setIsPublishedValue(false);
                    formRef.current?.requestSubmit();
                  }}
                >
                  Снять с публикации
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    if (isPublishedHiddenRef.current) isPublishedHiddenRef.current.value = "on";
                    setIsPublishedValue(true);
                    formRef.current?.requestSubmit();
                  }}
                >
                  Опубликовать
                </Button>
              )}
            </div>

            {/* Preview toggle */}
            <Button type="button" variant="outline" className="w-full" onClick={() => setPreviewOpen((v) => !v)}>
              {previewOpen ? "Скрыть предпросмотр" : "Показать предпросмотр"}
            </Button>

            {/* Картинка */}
            <div className="flex flex-col gap-1.5">
              <Label className={fieldLabelClass}>Картинка</Label>
              <input type="hidden" name="image_url" value={imageUrlValue} />
              <MediaLibraryPickerDialog kind="image" value={imageUrlValue} onChange={setImageUrlValue} />
            </div>

            {/* Видео */}
            <div className="flex flex-col gap-1.5">
              <Label className={fieldLabelClass}>Видео</Label>
              <input type="hidden" name="video_url" value={videoUrlValue} />
              <MediaLibraryPickerDialog kind="video" value={videoUrlValue} onChange={setVideoUrlValue} />
            </div>

            {/* Связан с курсом */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="content-linked-course" className={fieldLabelClass}>
                Связан с курсом (если это промо-материал)
              </Label>
              <select
                id="content-linked-course"
                name="linked_course_id"
                className={selectClass}
                defaultValue={page?.linkedCourseId ?? ""}
                key={`linked-course-${page?.id ?? "new"}`}
                onChange={(e) => setLinkedCourseIdValue(e.target.value)}
              >
                <option value="">— не выбрано —</option>
                {publishedCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {/* ── END SIDEBAR COLUMN ──────────────────────────────────────────── */}
      </div>

      {/* Preview panel (full-width, below the grid) */}
      {previewOpen ? (
        <div className="mt-6">
          <ContentPreview
            title={titleValue}
            summary={summaryValue}
            bodyMd={bodyMdValue}
            imageUrl={imageUrlValue}
            videoUrl={videoUrlValue}
          />
        </div>
      ) : null}
    </form>
  );
}
