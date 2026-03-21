"use client";

import { saveContentPage } from "./actions";

type ContentPage = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  videoUrl: string | null;
};

export function ContentForm({ page }: { page?: ContentPage }) {
  return (
    <form action={saveContentPage} className="stack" style={{ gap: "1rem" }}>
      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Заголовок</span>
        <input
          type="text"
          name="title"
          className="auth-input"
          required
          defaultValue={page?.title ?? ""}
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Раздел</span>
        <select name="section" className="auth-input" defaultValue={page?.section ?? "lessons"}>
          <option value="lessons">lessons</option>
          <option value="emergency">emergency</option>
        </select>
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
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Краткое описание</span>
        <textarea
          name="summary"
          className="auth-input"
          rows={2}
          defaultValue={page?.summary ?? ""}
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Содержимое (HTML)</span>
        <textarea
          name="body_html"
          className="auth-input"
          rows={10}
          defaultValue={page?.bodyHtml ?? ""}
        />
      </label>

      <label className="stack" style={{ gap: "0.25rem" }}>
        <span className="eyebrow">Порядок сортировки</span>
        <input
          type="number"
          name="sort_order"
          className="auth-input"
          defaultValue={page?.sortOrder ?? 0}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={page?.isPublished ?? true}
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
        />
      </label>

      <button type="submit" className="button">
        Сохранить
      </button>
    </form>
  );
}
