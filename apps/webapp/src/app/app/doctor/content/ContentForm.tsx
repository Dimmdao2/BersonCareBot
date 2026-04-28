"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditorToastUi } from "@/shared/ui/markdown/MarkdownEditorToastUi";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import { fallbackSlug, slugFromTitle } from "@/shared/lib/slugify";
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

export function ContentForm({
  page,
  sections,
  publishedCourses = [],
}: {
  page?: ContentPage;
  sections: ContentSectionRow[];
  publishedCourses?: PublishedCourseOption[];
}) {
  const [state, formAction, pending] = useActionState(saveContentPage, null as SaveContentPageState | null);
  const isNew = !page;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [titleValue, setTitleValue] = useState(page?.title ?? "");
  const [summaryValue, setSummaryValue] = useState(page?.summary ?? "");
  const [bodyMdValue, setBodyMdValue] = useState(
    page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : "",
  );
  const [slugValue, setSlugValue] = useState(page?.slug ?? "");
  const [imageUrlValue, setImageUrlValue] = useState(page?.imageUrl ?? "");
  const [videoUrlValue, setVideoUrlValue] = useState(page?.videoUrl ?? "");
  const slugManualRef = useRef(false);

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

  const sectionTitleForEdit =
    (page && sections.find((s) => s.slug === page.section)?.title) ?? page?.section ?? "";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onInput={(e) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (!target) return;
        if (target.name === "title") setTitleValue(target.value);
        if (target.name === "summary") setSummaryValue(target.value);
        if (target.name === "body_md") setBodyMdValue(target.value);
      }}
    >
      {state?.error ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm text-green-700">
          Сохранено
        </p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Заголовок</span>
        {isNew ? (
          <Input
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
            type="text"
            name="title"
            required
            defaultValue={page?.title ?? ""}
            key={`title-${page?.id ?? "new"}`}
          />
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Раздел</span>
        {page ? (
          <>
            <input type="hidden" name="section" value={page.section} />
            <Input type="text" value={sectionTitleForEdit} disabled readOnly />
          </>
        ) : (
          <select
            id="content-section"
            name="section"
            required
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={sections[0]?.slug ?? ""}
          >
            {sections.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
        {isNew ? (
          <div className="flex flex-wrap gap-2">
            <Input
              type="text"
              name="slug"
              required
              className="min-w-[12rem] flex-1"
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
              className="shrink-0"
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
            type="text"
            name="slug"
            required
            defaultValue={page?.slug ?? ""}
            readOnly
            key={`slug-${page?.id ?? "new"}`}
          />
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Краткое описание</span>
        <Textarea
          name="summary"
          rows={2}
          defaultValue={page?.summary ?? ""}
          key={`summary-${page?.id ?? "new"}`}
        />
      </label>

      <MarkdownEditorToastUi
        name="body_md"
        defaultValue={
          page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : ""
        }
        key={`body-${page?.id ?? "new"}`}
        onValueChange={setBodyMdValue}
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={page?.isPublished ?? true}
          key={`pub-${page?.id ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Опубликовано</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="requires_auth"
          defaultChecked={page?.requiresAuth ?? false}
          key={`req-${page?.id ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Только для залогиненных (щит)
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Связан с курсом (если это промо-материал)
        </span>
        <select
          name="linked_course_id"
          className="h-11 w-full max-w-md rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={page?.linkedCourseId ?? ""}
          key={`linked-course-${page?.id ?? "new"}`}
        >
          <option value="">— не выбрано —</option>
          {publishedCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Картинка</span>
        <input type="hidden" name="image_url" value={imageUrlValue} />
        <MediaLibraryPickerDialog kind="image" value={imageUrlValue} onChange={setImageUrlValue} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Видео</span>
        <input type="hidden" name="video_url" value={videoUrlValue} />
        <MediaLibraryPickerDialog kind="video" value={videoUrlValue} onChange={setVideoUrlValue} />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
          {previewOpen ? "Скрыть предпросмотр" : "Показать предпросмотр"}
        </Button>
        {previewOpen ? (
          <ContentPreview
            title={titleValue}
            summary={summaryValue}
            bodyMd={bodyMdValue}
            imageUrl={imageUrlValue}
            videoUrl={videoUrlValue}
          />
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
