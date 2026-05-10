"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useId, useState } from "react";
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
import { deleteContentSection, type DeleteContentSectionState } from "./actions";

type Props = {
  sectionSlug: string;
  sectionTitle: string;
  pagesInSection: number;
  /** Куда перейти после успешного удаления. */
  afterDeleteHref?: string;
  /** Если false — только содержимое диалога; задайте `open` и `onOpenChange`. */
  showTriggerButton?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SectionDeleteDialog({
  sectionSlug,
  sectionTitle,
  pagesInSection,
  afterDeleteHref = "/app/doctor/content/sections",
  showTriggerButton = true,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) controlledOnOpenChange(next);
      else setUncontrolledOpen(next);
    },
    [isControlled, controlledOnOpenChange],
  );

  const formAction = useCallback(
    async (prev: DeleteContentSectionState | null, formData: FormData) => {
      const next = await deleteContentSection(prev, formData);
      if (next?.ok) {
        setOpen(false);
        router.push(afterDeleteHref);
        router.refresh();
      }
      return next;
    },
    [afterDeleteHref, router, setOpen],
  );

  const [state, submitAction, pending] = useActionState(formAction, null as DeleteContentSectionState | null);
  const confirmId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTriggerButton ? (
        <DialogTrigger render={<Button type="button" variant="destructive" className="self-start" />}>
          Удалить раздел…
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Удалить раздел</DialogTitle>
          <DialogDescription>
            Раздел «{sectionTitle}» (<span className="font-mono text-foreground">{sectionSlug}</span>) будет удалён.
            {pagesInSection > 0 ? (
              <>
                {" "}
                Страниц в разделе:{" "}
                <span className="font-medium text-foreground">{pagesInSection}</span> — они будут перенесены в служебный
                раздел «Без раздела» (не виден пациентам). При совпадении slug страница получит суффикс в адресе.
              </>
            ) : (
              <> В этом разделе нет страниц.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <form action={submitAction} className="flex flex-col gap-3">
          <input type="hidden" name="section_slug" value={sectionSlug} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm_delete" value="on" id={confirmId} className="mt-1" required />
            <span>Я понимаю, что раздел будет удалён{pagesInSection > 0 ? ", а страницы перенесены" : ""}.</span>
          </label>
          {state && state.ok === false ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Удаление…" : "Удалить раздел"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
