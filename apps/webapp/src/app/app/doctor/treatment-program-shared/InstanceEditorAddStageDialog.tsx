"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import { isProgramInstanceEditLocked } from "./programInstanceMutationGuard";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";

export function InstanceEditorAddStageDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programStatus: TreatmentProgramInstanceStatus;
}) {
  const { open, onOpenChange, programStatus } = props;
  const { addStageCreate } = useInstanceEditorDraft();
  const titleFieldId = useId();
  const [titleDraft, setTitleDraft] = useState("");
  const editLocked = isProgramInstanceEditLocked(programStatus);

  const submit = () => {
    const t = titleDraft.trim();
    if (!t || editLocked) return;
    addStageCreate({ title: t });
    setTitleDraft("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTitleDraft("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый этап</DialogTitle>
          <DialogDescription>
            Этап попадёт в черновик; порядок можно изменить перед сохранением программы.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={titleFieldId}>Название</Label>
          <Input
            id={titleFieldId}
            className="text-sm"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={2000}
            disabled={editLocked}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={editLocked || !titleDraft.trim()} onClick={submit}>
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
