"use client";

import { useRouter } from "next/navigation";
import { EllipsisVertical, Eye, EyeOff } from "lucide-react";
import { applyContentLifecycleForm } from "./lifecycleActions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Page = {
  id: string;
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

function HiddenLifecycleForm({ id, op }: { id: string; op: string }) {
  return (
    <form id={`content-lifecycle-${id}-${op}`} action={applyContentLifecycleForm} className="hidden" aria-hidden>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" tabIndex={-1}>
        submit
      </button>
    </form>
  );
}

function submitFormById(formId: string) {
  const el = document.getElementById(formId);
  if (el instanceof HTMLFormElement) el.requestSubmit();
}

function LifecycleMenuItem({
  formId,
  label,
  destructive,
}: {
  formId: string;
  label: string;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      onClick={() => {
        submitFormById(formId);
      }}
    >
      <span className={cn(destructive && "text-destructive")}>{label}</span>
    </DropdownMenuItem>
  );
}

/** Индикатор «опубликовано» + меню lifecycle (как раньше в таблице). */
export function ContentLifecycleDropdown({ page }: { page: Page }) {
  const router = useRouter();
  const deleted = page.deletedAt != null;
  const archived = page.archivedAt != null;
  const published = page.isPublished;
  const id = page.id;

  return (
    <>
      {!deleted ? (
        <>
          <HiddenLifecycleForm id={id} op="publish" />
          <HiddenLifecycleForm id={id} op="unpublish" />
          <HiddenLifecycleForm id={id} op="archive" />
          <HiddenLifecycleForm id={id} op="unarchive" />
          <HiddenLifecycleForm id={id} op="soft_delete" />
        </>
      ) : (
        <HiddenLifecycleForm id={id} op="restore" />
      )}

      <div className="flex shrink-0 items-center gap-1">
        {!deleted ? (
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-full border border-border/80 hover:bg-muted"
            title={published ? "Снять с публикации" : "Опубликовать"}
            aria-label={published ? "Снять с публикации" : "Опубликовать"}
            onClick={() =>
              submitFormById(`content-lifecycle-${id}-${published ? "unpublish" : "publish"}`)
            }
          >
            {published ? (
              <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
            ) : (
              <EyeOff className="size-4 text-muted-foreground" aria-hidden />
            )}
          </button>
        ) : (
          <span
            className="inline-flex size-8 items-center justify-center rounded-full border border-border/80"
            title="Удалено"
          >
            <EyeOff className="size-4 text-muted-foreground" aria-hidden />
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/app/doctor/content/edit/${id}`)}>
                Редактировать
              </DropdownMenuItem>
              {deleted ? (
                <LifecycleMenuItem formId={`content-lifecycle-${id}-restore`} label="Восстановить" />
              ) : (
                <>
                  {archived ? (
                    <LifecycleMenuItem formId={`content-lifecycle-${id}-unarchive`} label="Из архива" />
                  ) : (
                    <LifecycleMenuItem formId={`content-lifecycle-${id}-archive`} label="В архив" />
                  )}
                  <LifecycleMenuItem
                    formId={`content-lifecycle-${id}-soft_delete`}
                    label="Удалить"
                    destructive
                  />
                </>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
