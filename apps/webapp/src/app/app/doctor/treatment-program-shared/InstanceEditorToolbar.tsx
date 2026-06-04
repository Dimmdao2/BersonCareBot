"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import type { TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import { isProgramInstanceEditLocked } from "./programInstanceMutationGuard";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";
import { tplToolbarTextBtnClass, INSTANCE_EDITOR_TOOLBAR_STICKY_CLASS } from "./treatmentProgramConstructorShellStyles";

export function InstanceEditorToolbar(props: {
  programTitle: string;
  patientProfileHref: string;
  patientDisplayName: string;
  programStatus: TreatmentProgramInstanceStatus;
  pipelineStageCount: number;
  onCommentsClick: () => void;
  onAddStageClick: () => void;
  onChangeStageOrderClick: () => void;
}) {
  const {
    programTitle,
    patientProfileHref,
    patientDisplayName,
    programStatus,
    pipelineStageCount,
    onCommentsClick,
    onAddStageClick,
    onChangeStageOrderClick,
  } = props;
  const { isDirty, saving, saveDraft, discardDraft } = useInstanceEditorDraft();
  const editLocked = isProgramInstanceEditLocked(programStatus);
  const statusLabel = programStatus === "completed" ? "завершена" : "активна";

  const handleSave = () => {
    void saveDraft().then((r) => {
      if (r.ok) {
        toast.success("Изменения сохранены");
      } else if (!r.cancelled && r.error) {
        toast.error(r.error);
      }
    });
  };

  return (
    <header
      id="instance-editor-toolbar"
      data-testid="instance-editor-toolbar"
      className={cn(
        INSTANCE_EDITOR_TOOLBAR_STICKY_CLASS,
        isDirty && !editLocked && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:justify-self-start">
          <h1 className="truncate font-semibold tracking-tight text-foreground">{programTitle}</h1>
          <span className="hidden text-muted-foreground sm:inline" aria-hidden>
            ·
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            <Link
              href={patientProfileHref}
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {patientDisplayName}
            </Link>
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
              programStatus === "completed"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary",
            )}
          >
            {statusLabel}
          </span>
          {isDirty && !editLocked ? (
            <span className="text-xs text-amber-800 dark:text-amber-200" role="status">
              Есть несохранённые изменения
            </span>
          ) : null}
        </div>

        <div className="flex justify-center lg:justify-self-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={tplToolbarTextBtnClass}
            onClick={onCommentsClick}
            data-testid="instance-editor-comments"
          >
            Комментарии
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 lg:justify-self-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={tplToolbarTextBtnClass}
            disabled={editLocked}
            onClick={onAddStageClick}
            data-testid="instance-editor-add-stage"
          >
            Добавить этап
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={tplToolbarTextBtnClass}
            disabled={editLocked || pipelineStageCount < 2}
            onClick={onChangeStageOrderClick}
            data-testid="instance-editor-change-stage-order"
          >
            Изменить порядок
          </Button>
          {isDirty && !editLocked ? (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => discardDraft()}>
              Отменить
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={editLocked || !isDirty || saving} onClick={handleSave}>
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </Button>
        </div>
      </div>
    </header>
  );
}
