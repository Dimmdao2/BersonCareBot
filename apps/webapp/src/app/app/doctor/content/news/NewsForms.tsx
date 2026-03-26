"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  toggleNewsArchive,
  toggleQuoteArchive,
  upsertMotivationQuote,
  upsertNewsItem,
  type NewsActionState,
} from "./actions";

type NewsRow = {
  id: string;
  title: string;
  body_md: string;
  is_visible: boolean;
  sort_order: number;
  archived_at: Date | null;
};

type QuoteRow = {
  id: string;
  body_text: string;
  author: string | null;
  is_active: boolean;
  sort_order: number;
  archived_at: Date | null;
};

export function NewsForms({ newsRows, quoteRows }: { newsRows: NewsRow[]; quoteRows: QuoteRow[] }) {
  const [newsState, newsAction, newsPending] = useActionState(upsertNewsItem, null as NewsActionState | null);
  const [quoteState, quoteAction, quotePending] = useActionState(upsertMotivationQuote, null as NewsActionState | null);

  return (
    <div className="stack" style={{ gap: "2rem" }}>
      <section className="stack" style={{ gap: "0.75rem" }}>
        <h3 className="eyebrow m-0">Новости</h3>
        {newsState?.error ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {newsState.error}
          </p>
        ) : null}
        {newsRows.map((n) => (
          <div key={n.id} className="rounded border border-border p-3 stack" style={{ gap: "0.5rem" }}>
            <form action={newsAction} className="stack" style={{ gap: "0.5rem" }}>
              <input type="hidden" name="id" value={n.id} />
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Заголовок
                <input name="title" className="auth-input" defaultValue={n.title} required />
              </label>
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Текст (Markdown)
                <textarea name="body_md" className="auth-input font-mono text-sm" rows={4} defaultValue={n.body_md} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_visible" defaultChecked={n.is_visible} />
                Видна пациенту
              </label>
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Порядок
                <input name="sort_order" type="number" className="auth-input" defaultValue={n.sort_order} />
              </label>
              <Button type="submit" className="w-fit" disabled={newsPending}>
                Сохранить
              </Button>
            </form>
            <form action={toggleNewsArchive} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="next_archived" value={n.archived_at ? "false" : "true"} />
              <Button type="submit" variant="outline">
                {n.archived_at ? "Из архива" : "В архив"}
              </Button>
              {n.archived_at ? <span className="text-xs text-muted-foreground">В архиве</span> : null}
            </form>
          </div>
        ))}
        <form action={newsAction} className="rounded border border-dashed border-border p-3 stack" style={{ gap: "0.5rem" }}>
          <strong className="text-sm">Новая новость</strong>
          <label className="stack text-sm" style={{ gap: "0.25rem" }}>
            Заголовок
            <input name="title" className="auth-input" />
          </label>
          <label className="stack text-sm" style={{ gap: "0.25rem" }}>
            Текст (Markdown)
            <textarea name="body_md" className="auth-input font-mono text-sm" rows={3} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_visible" />
            Видна пациенту
          </label>
          <label className="stack text-sm" style={{ gap: "0.25rem" }}>
            Порядок
            <input name="sort_order" type="number" className="auth-input" defaultValue={0} />
          </label>
          <Button type="submit" disabled={newsPending}>
            Добавить
          </Button>
        </form>
      </section>

      <section className="stack" style={{ gap: "0.75rem" }}>
        <h3 className="eyebrow m-0">Мотивационные цитаты</h3>
        {quoteState?.error ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {quoteState.error}
          </p>
        ) : null}
        {quoteRows.map((q) => (
          <div key={q.id} className="rounded border border-border p-3 stack" style={{ gap: "0.5rem" }}>
            <form action={quoteAction} className="stack" style={{ gap: "0.5rem" }}>
              <input type="hidden" name="id" value={q.id} />
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Текст
                <textarea name="body_text" className="auth-input text-sm" rows={3} defaultValue={q.body_text} required />
              </label>
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Автор
                <input name="author" className="auth-input" defaultValue={q.author ?? ""} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={q.is_active} />
                Активна
              </label>
              <label className="stack text-sm" style={{ gap: "0.25rem" }}>
                Порядок
                <input name="sort_order" type="number" className="auth-input" defaultValue={q.sort_order} />
              </label>
              <Button type="submit" className="w-fit" disabled={quotePending}>
                Сохранить
              </Button>
            </form>
            <form action={toggleQuoteArchive}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="next_archived" value={q.archived_at ? "false" : "true"} />
              <Button type="submit" variant="outline">
                {q.archived_at ? "Из архива" : "В архив"}
              </Button>
            </form>
          </div>
        ))}
        <form action={quoteAction} className="rounded border border-dashed border-border p-3 stack" style={{ gap: "0.5rem" }}>
          <strong className="text-sm">Новая цитата</strong>
          <textarea name="body_text" className="auth-input text-sm" rows={2} placeholder="Текст" />
          <input name="author" className="auth-input" placeholder="Автор (необязательно)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked />
            Активна
          </label>
          <input name="sort_order" type="number" className="auth-input" defaultValue={0} />
          <Button type="submit" disabled={quotePending}>
            Добавить
          </Button>
        </form>
      </section>
    </div>
  );
}
