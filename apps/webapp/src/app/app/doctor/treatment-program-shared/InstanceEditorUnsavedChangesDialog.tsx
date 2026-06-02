"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed?: () => void;
  title?: string;
  description?: string;
};

export function InstanceEditorUnsavedChangesDialog(props: Props) {
  const {
    open,
    onOpenChange,
    onProceed,
    title = "Сначала сохраните изменения",
    description = "Смена статуса этапа доступна только после сохранения или отмены правок в черновике.",
  } = props;
  const { saving, discardDraft, saveDraft } = useInstanceEditorDraft();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              discardDraft();
              onOpenChange(false);
              onProceed?.();
            }}
          >
            Отменить изменения
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              void saveDraft().then((r) => {
                if (r.ok) {
                  onOpenChange(false);
                  onProceed?.();
                }
              });
            }}
          >
            {saving ? "Сохранение…" : "Сохранить и продолжить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Хук: блокировать действие при несохранённом черновике. */
export function useInstanceEditorUnsavedGate(options?: { title?: string; description?: string }) {
  const { isDirty } = useInstanceEditorDraft();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const runOrPromptSave = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingRef.current = action;
      setDialogOpen(true);
    },
    [isDirty],
  );

  const dialog = (
    <InstanceEditorUnsavedChangesDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      onProceed={() => {
        pendingRef.current?.();
        pendingRef.current = null;
      }}
      title={options?.title}
      description={options?.description}
    />
  );

  return { runOrPromptSave, unsavedDialog: dialog };
}
