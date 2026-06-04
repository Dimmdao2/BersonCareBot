"use client";

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
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
    title = "Несохранённые изменения",
    description = "Для изменения статуса этапа (программы) необходимо сохранить изменения. Сохранить?",
  } = props;
  const { saving, saveDraft } = useInstanceEditorDraft();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Вернуться к редактированию
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              void saveDraft().then((r) => {
                if (r.ok) {
                  onProceed?.();
                  onOpenChange(false);
                  return;
                }
                if (!r.cancelled && r.error) {
                  toast.error(r.error);
                }
              });
            }}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Хук: блокировать действие при несохранённом черновике. */
export function useInstanceEditorUnsavedGate(options?: { title?: string; description?: string }) {
  const { isFlushableDirty } = useInstanceEditorDraft();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const runOrPromptSave = useCallback(
    (action: () => void) => {
      if (!isFlushableDirty) {
        action();
        return;
      }
      pendingRef.current = action;
      setDialogOpen(true);
    },
    [isFlushableDirty],
  );

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      pendingRef.current = null;
    }
  }, []);

  const dialog = (
    <InstanceEditorUnsavedChangesDialog
      open={dialogOpen}
      onOpenChange={handleDialogOpenChange}
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
