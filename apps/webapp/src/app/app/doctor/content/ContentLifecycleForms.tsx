"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
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
          <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={pending}>
            Восстановить
          </Button>
        </form>
      ) : (
        <>
          {page.isPublished ? (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="unpublish" />
              <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={pending}>
                Снять с публикации
              </Button>
            </form>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="publish" />
              <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={pending}>
                Опубликовать
              </Button>
            </form>
          )}
          {archived ? (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="unarchive" />
              <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={pending}>
                Из архива
              </Button>
            </form>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="id" value={page.id} />
              <input type="hidden" name="op" value="archive" />
              <Button type="submit" variant="outline" size="sm" className="text-xs" disabled={pending}>
                В архив
              </Button>
            </form>
          )}
          <form action={formAction}>
            <input type="hidden" name="id" value={page.id} />
            <input type="hidden" name="op" value="soft_delete" />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
            >
              Удалить
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
