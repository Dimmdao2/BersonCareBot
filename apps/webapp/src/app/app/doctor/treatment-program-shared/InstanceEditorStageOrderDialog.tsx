"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
import type { TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import { isProgramInstanceEditLocked } from "./programInstanceMutationGuard";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";
import {
  TreatmentProgramPipelineStagesDnd,
  TreatmentProgramSortablePipelineStage,
} from "./TreatmentProgramDndUi";

function StageOrderDialogBody(props: {
  programStatus: TreatmentProgramInstanceStatus;
  stageZeroId: string | null;
  pipelineIds: string[];
  titleById: Map<string, string>;
  onClose: () => void;
}) {
  const { programStatus, stageZeroId, pipelineIds, titleById, onClose } = props;
  const { setStageOrder } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const [localIds, setLocalIds] = useState<string[]>(() => pipelineIds);

  const saveOrder = () => {
    if (editLocked || !stageZeroId) return;
    setStageOrder([stageZeroId, ...localIds]);
    onClose();
  };

  const onReorder = (activeId: string, overId: string) => {
    setLocalIds((prev) => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Изменить порядок этапов</DialogTitle>
        <DialogDescription>
          Порядок сохранится в черновик; на сервер — после «Сохранить изменения» в шапке программы.
        </DialogDescription>
      </DialogHeader>
      <TreatmentProgramPipelineStagesDnd stageIds={localIds} disabled={editLocked} onReorder={onReorder}>
        <div className="flex flex-col gap-2" data-testid="instance-editor-stage-order-list">
          {localIds.map((id) => (
            <TreatmentProgramSortablePipelineStage
              key={id}
              id={id}
              disabled={editLocked}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2"
            >
              {(dragHandle) => (
                <>
                  {dragHandle}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {titleById.get(id) ?? "Этап"}
                  </span>
                </>
              )}
            </TreatmentProgramSortablePipelineStage>
          ))}
        </div>
      </TreatmentProgramPipelineStagesDnd>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" disabled={editLocked || !stageZeroId} onClick={saveOrder}>
          Сохранить порядок
        </Button>
      </DialogFooter>
    </>
  );
}

export function InstanceEditorStageOrderDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programStatus: TreatmentProgramInstanceStatus;
  stageZeroId: string | null;
  pipelineStages: Array<{ id: string; title: string }>;
}) {
  const { open, onOpenChange, programStatus, stageZeroId, pipelineStages } = props;
  const pipelineIds = useMemo(() => pipelineStages.map((s) => s.id), [pipelineStages]);
  const titleById = useMemo(
    () => new Map(pipelineStages.map((s) => [s.id, s.title] as const)),
    [pipelineStages],
  );
  const listKey = pipelineIds.join("|");

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {open ? (
          <StageOrderDialogBody
            key={listKey}
            programStatus={programStatus}
            stageZeroId={stageZeroId}
            pipelineIds={pipelineIds}
            titleById={titleById}
            onClose={handleClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
