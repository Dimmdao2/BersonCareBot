"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/shared/ui/markdown/MarkdownEditor";
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
  videoUrl: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
};

export function ContentForm({ page }: { page?: ContentPage }) {
  const [state, formAction, pending] = useActionState(saveContentPage, null as SaveContentPageState | null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
        <Input
          type="text"
          name="title"
          required
          defaultValue={page?.title ?? ""}
          key={`title-${page?.id ?? "new"}`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Раздел</span>
        {page ? (
          <>
            <input type="hidden" name="section" value={page.section} />
            <Input type="text" value={page.section} disabled readOnly />
          </>
        ) : (
          <select
            id="content-section"
            name="section"
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue="lessons"
          >
            <option value="lessons">lessons</option>
            <option value="emergency">emergency</option>
          </select>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</span>
        <Input
          type="text"
          name="slug"
          required
          defaultValue={page?.slug ?? ""}
          readOnly={!!page}
          key={`slug-${page?.id ?? "new"}`}
        />
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

      <MarkdownEditor
        name="body_md"
        defaultValue={
          page ? (page.bodyMd.trim().length > 0 ? page.bodyMd : page.bodyHtml) : ""
        }
        key={`body-${page?.id ?? "new"}`}
      />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Порядок сортировки</span>
        <Input
          type="number"
          name="sort_order"
          defaultValue={page?.sortOrder ?? 0}
          key={`sort-${page?.id ?? "new"}`}
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={page?.isPublished ?? true}
          key={`pub-${page?.id ?? "new"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Опубликовано</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">URL видео</span>
        <Input
          type="text"
          name="video_url"
          defaultValue={page?.videoUrl ?? ""}
          key={`video-${page?.id ?? "new"}`}
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
