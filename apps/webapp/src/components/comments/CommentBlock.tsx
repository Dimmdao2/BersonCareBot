"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommentTargetType, CommentType, EntityComment } from "@/modules/comments/types";
import { COMMENT_TYPES } from "@/modules/comments/types";

const COMMENT_TYPE_LABEL: Record<CommentType, string> = {
  template: "Шаблон",
  individual_override: "Индив. правка",
  clinical_note: "Клиническая заметка",
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export type CommentBlockProps = {
  targetType: CommentTargetType;
  targetId: string;
  currentUserId: string;
  /** Админ может править/удалять чужие комментарии (как в API). */
  isAdmin?: boolean;
  title?: string;
  /** Запретить добавление и правки существующих (например, завершённая программа). */
  mutationsDisabled?: boolean;
};

/**
 * Переиспользуемый блок: список и CRUD через `/api/doctor/comments` для цели §7.
 * Новые экраны должны импортировать этот компонент, а не копировать fetch/PATCH/DELETE.
 */
export function CommentBlock({
  targetType,
  targetId,
  currentUserId,
  isAdmin = false,
  title = "Комментарии",
  mutationsDisabled = false,
}: CommentBlockProps) {
  const [items, setItems] = useState<EntityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBody, setNewBody] = useState("");
  const [newType, setNewType] = useState<CommentType>("clinical_note");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        targetType,
        targetId,
      });
      const res = await fetch(`/api/doctor/comments?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: EntityComment[] };
      if (!res.ok || !data.ok || !data.items) {
        setError("Не удалось загрузить комментарии");
        setItems([]);
        return;
      }
      setItems(data.items);
    } catch {
      setError("Не удалось загрузить комментарии");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  function canMutate(c: EntityComment): boolean {
    if (mutationsDisabled) return false;
    return c.authorId === currentUserId || isAdmin;
  }

  async function submitNew() {
    const body = newBody.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/doctor/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          commentType: newType,
          body,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Ошибка сохранения");
        return;
      }
      setNewBody("");
      await load();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) return;
    const res = await fetch(`/api/doctor/comments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Ошибка обновления");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function remove(id: string) {
    if (!globalThis.confirm("Удалить комментарий?")) return;
    const res = await fetch(`/api/doctor/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Ошибка удаления");
      return;
    }
    await load();
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      aria-labelledby={`comment-block-title-${targetId}`}
    >
      <h3 id={`comment-block-title-${targetId}`} className="text-base font-semibold tracking-tight">
        {title}
      </h3>

      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {mutationsDisabled ? null : (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Новый комментарий</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={newType} onValueChange={(v) => setNewType(v as CommentType)}>
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="Тип комментария">
                <SelectValue>{COMMENT_TYPE_LABEL[newType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COMMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {COMMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={3}
            placeholder="Текст…"
            disabled={submitting}
            className="text-sm"
          />
          <Button type="button" onClick={() => void submitNew()} disabled={submitting || !newBody.trim()}>
            {submitting ? "Отправка…" : "Добавить"}
          </Button>
        </div>
      )}

      <div className={mutationsDisabled ? "mt-4" : "mt-6"}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Список</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет комментариев.</p>
        ) : (
          <ul className="m-0 list-none space-y-3 p-0">
            {items.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/80 bg-muted/15 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {COMMENT_TYPE_LABEL[c.commentType]} · {formatWhen(c.createdAt)}
                    {c.updatedAt !== c.createdAt ? " (изм.)" : ""}
                  </span>
                  {canMutate(c) ? (
                    <span className="text-xs text-muted-foreground">
                      {c.authorId === currentUserId ? "Вы" : "админ"}
                    </span>
                  ) : null}
                </div>
                {editingId === c.id ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void saveEdit(c.id)}>
                        Сохранить
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-foreground">{c.body}</p>
                )}
                {canMutate(c) && editingId !== c.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditBody(c.body);
                      }}
                    >
                      Изменить
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void remove(c.id)}>
                      Удалить
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
