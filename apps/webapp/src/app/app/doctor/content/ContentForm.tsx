"use client";

import { useActionState } from "react";
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
    <form action={formAction} className="stack" style={{ gap: "1rem" }}>
      {state?.error ? (
        <p role="alert" className="empty-state" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" style={{ color: "#15803d", fontSize: "0.9rem" }}>
          Сохранено
        </p>
      ) : null}

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Заголовок</span>
        <input
          type="text"
          name="title"
          className="auth-input"
          required
          defaultValue={page?.title ?? ""}
          key={`title-${page?.id ?? "new"}`}
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Раздел</span>
        {page ? (
          <>
            <input type="hidden" name="section" value={page.section} />
            <input type="text" className="auth-input" value={page.section} disabled readOnly />
          </>
        ) : (
          <select id="content-section" name="section" className="auth-input" defaultValue="lessons">
            <option value="lessons">lessons</option>
            <option value="emergency">emergency</option>
          </select>
        )}
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Slug</span>
        <input
          type="text"
          name="slug"
          className="auth-input"
          required
          defaultValue={page?.slug ?? ""}
          readOnly={!!page}
          key={`slug-${page?.id ?? "new"}`}
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Краткое описание</span>
        <textarea
          name="summary"
          className="auth-input"
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

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Порядок сортировки</span>
        <input
          type="number"
          name="sort_order"
          className="auth-input"
          defaultValue={page?.sortOrder ?? 0}
          key={`sort-${page?.id ?? "new"}`}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={page?.isPublished ?? true}
          key={`pub-${page?.id ?? "new"}`}
        />
        <span className="eyebrow">Опубликовано</span>
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">URL видео</span>
        <input
          type="text"
          name="video_url"
          className="auth-input"
          defaultValue={page?.videoUrl ?? ""}
          key={`video-${page?.id ?? "new"}`}
        />
      </label>

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Сохранение…" : "Сохранить"}
      </button>
    </form>
  );
}
