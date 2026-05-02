"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renameContentSectionSlug, type RenameContentSectionSlugState } from "./actions";

type Props = {
  oldSlug: string;
  pagesAffectedCount: number;
  disabled?: boolean;
  disabledReason?: string;
};

export function SectionSlugRenameDialog({ oldSlug, pagesAffectedCount, disabled, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(renameContentSectionSlug, null as RenameContentSectionSlugState | null);
  const newSlugFieldId = useId();
  const confirmId = useId();

  if (disabled) {
    return (
      <p className="max-w-sm text-xs text-muted-foreground">
        {disabledReason ?? "Переименование slug для этого раздела недоступно."}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" className="self-start" />}>
        Переименовать slug…
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Переименование slug раздела</DialogTitle>
          <DialogDescription>
            Текущий slug: <span className="font-mono text-foreground">{oldSlug}</span>. Будут обновлены ссылки в
            страницах контента и история редиректов для пациентских URL. Действие необратимо по смыслу (старый slug
            остаётся только как запись в истории).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="old_slug" value={oldSlug} />
          <label className="flex flex-col gap-1" htmlFor={newSlugFieldId}>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Новый slug</span>
            <Input
              id={newSlugFieldId}
              name="new_slug"
              required
              className="font-mono"
              placeholder="новый-slug"
              pattern="[a-z0-9-]+"
              autoComplete="off"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Затронуто страниц контента в этом разделе: <span className="font-medium text-foreground">{pagesAffectedCount}</span>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm_rename" value="on" id={confirmId} className="mt-1" required />
            <span id={`${confirmId}-label`}>Я понимаю, что ссылки и URL раздела изменятся; старый адрес будет перенаправлять на новый.</span>
          </label>
          {state && state.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Переименование…" : "Переименовать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
