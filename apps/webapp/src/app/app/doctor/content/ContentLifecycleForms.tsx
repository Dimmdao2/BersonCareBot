"use client";

import { useActionState } from "react";
import { applyContentLifecycle, type LifecycleState } from "./lifecycleActions";

type Row = {
  id: string;
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

export function ContentLifecycleForms({ page }: { page: Row }) {
  const [state, formAction, pending] = useActionState(applyContentLifecycle, null as LifecycleState | null);
  const deleted = page.deletedAt != null;
  const archived = page.archivedAt != null;

  return (
    <div className="flex flex-wrap items-center gap-1" style={{ maxWidth: 320 }}>
      {state?.error ? (
        <span className="text-xs" style={{ color: "#b91c1c" }}>
          {state.error}
        </span>
      ) : null}
      {deleted ? (
        <form action={formAction}>
          <input type="hidden" name="id" value={page.id} />
          <input type="hidden" name="op" value="restore" />
          <button type="submit" className="button button-outline text-xs" disabled={pending}>
            Восстановить
          </button>
        </form>
      ) : (
        <>
          {page.isPublished ? (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="unpublish" />
              <button type="submit" className="button button-outline text-xs" disabled={pending}>
                Снять с публикации
              </button>
            </form>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="publish" />
              <button type="submit" className="button button-outline text-xs" disabled={pending}>
                Опубликовать
              </button>
            </form>
          )}
          {archived ? (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="unarchive" />
              <button type="submit" className="button button-outline text-xs" disabled={pending}>
                Из архива
              </button>
            </form>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="archive" />
              <button type="submit" className="button button-outline text-xs" disabled={pending}>
                В архив
              </button>
            </form>
          )}
          <form action={formAction}>
            <input type="hidden" name="id" value={page.id} />
            <input type="hidden" name="op" value="soft_delete" />
            <button type="submit" className="button button-outline text-xs" disabled={pending} style={{ color: "#b91c1c" }}>
              Удалить
            </button>
          </form>
        </>
      )}
    </div>
  );
}
