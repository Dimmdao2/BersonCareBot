"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Новости</h3>
        {newsState?.error ? (
          <p role="alert" className="text-destructive">
            {newsState.error}
          </p>
        ) : null}
        {newsRows.map((n) => (
          <div key={n.id} className="flex flex-col gap-2 rounded border border-border p-3">
            <form action={newsAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={n.id} />
              <label className="flex flex-col gap-1 text-sm">
                Заголовок
                <Input name="title" defaultValue={n.title} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Текст (Markdown)
                <Textarea name="body_md" className="font-mono text-sm" rows={4} defaultValue={n.body_md} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_visible" defaultChecked={n.is_visible} />
                Видна пациенту
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Порядок
                <Input name="sort_order" type="number" defaultValue={n.sort_order} />
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
        <form action={newsAction} className="flex flex-col gap-2 rounded border border-dashed border-border p-3">
          <strong className="text-sm">Новая новость</strong>
          <label className="flex flex-col gap-1 text-sm">
            Заголовок
            <Input name="title" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Текст (Markdown)
            <Textarea name="body_md" className="font-mono text-sm" rows={3} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_visible" />
            Видна пациенту
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Порядок
            <Input name="sort_order" type="number" defaultValue={0} />
          </label>
          <Button type="submit" disabled={newsPending}>
            Добавить
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Мотивационные цитаты</h3>
        {quoteState?.error ? (
          <p role="alert" className="text-destructive">
            {quoteState.error}
          </p>
        ) : null}
        {quoteRows.map((q) => (
          <div key={q.id} className="flex flex-col gap-2 rounded border border-border p-3">
            <form action={quoteAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={q.id} />
              <label className="flex flex-col gap-1 text-sm">
                Текст
                <Textarea name="body_text" className="text-sm" rows={3} defaultValue={q.body_text} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Автор
                <Input name="author" defaultValue={q.author ?? ""} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={q.is_active} />
                Активна
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Порядок
                <Input name="sort_order" type="number" defaultValue={q.sort_order} />
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
        <form action={quoteAction} className="flex flex-col gap-2 rounded border border-dashed border-border p-3">
          <strong className="text-sm">Новая цитата</strong>
          <Textarea name="body_text" className="text-sm" rows={2} placeholder="Текст" />
          <Input name="author" placeholder="Автор (необязательно)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked />
            Активна
          </label>
          <Input name="sort_order" type="number" defaultValue={0} />
          <Button type="submit" disabled={quotePending}>
            Добавить
          </Button>
        </form>
      </section>
    </div>
  );
}
