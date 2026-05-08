"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { patientLfkDifficultySelectItems } from "@/shared/ui/selectOpaqueValueLabels";
import { listLfkSnapshotExerciseLines } from "@/modules/treatment-program/programActionActivityKey";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import { cn } from "@/lib/utils";
import { patientCompactActionClass, patientFormSurfaceClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { snapshotTitle } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";

export function PatientLfkChecklistRow(props: {
  row: PatientProgramChecklistRow;
  itemBaseUrl: string;
  done: boolean;
  onUpdated: (ids: string[]) => void;
  /** После успешного сохранения — обновить счётчики checklist-today и деталь программы. */
  onAfterSave: () => void | Promise<void>;
  setError: (e: string | null) => void;
}) {
  const { row, itemBaseUrl, done, onUpdated, onAfterSave, setError } = props;
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className={cn(patientFormSurfaceClass, "gap-3 border border-[var(--patient-border)]/70 p-3")}>
      <p className="text-sm font-medium">{snapshotTitle(row.item.snapshot, row.item.itemType)}</p>
      {row.groupTitle ? <p className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</p> : null}
      {done ? (
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          Сегодня занятие уже отмечено — при необходимости добавьте ещё одну отметку ниже.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        <Label className={cn(patientMutedTextClass, "text-xs")}>Как прошло занятие?</Label>
        <Select
          value={difficulty}
          onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}
          disabled={pending}
          items={patientLfkDifficultySelectItems}
        >
          <SelectTrigger className="h-10 w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">Легко</SelectItem>
            <SelectItem value="medium">Средне</SelectItem>
            <SelectItem value="hard">Тяжело</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <Label htmlFor={`lfk-note-${row.item.id}`} className={cn(patientMutedTextClass, "text-xs")}>
          Заметка для врача
        </Label>
        <Textarea
          id={`lfk-note-${row.item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          rows={3}
          className="min-h-[72px] resize-y text-sm"
          maxLength={4000}
        />
      </div>
      <button
        type="button"
        className={cn(patientCompactActionClass, "mt-2 h-9 w-fit text-sm")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch(`${itemBaseUrl}/${encodeURIComponent(row.item.id)}/progress/lfk-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                difficulty,
                note: note.trim() || null,
                completedExerciseIds: listLfkSnapshotExerciseLines(
                  row.item.snapshot as Record<string, unknown>,
                ).map((l) => l.exerciseId),
              }),
            });
            const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[]; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Ошибка сохранения");
              return;
            }
            if (data.doneItemIds) onUpdated(data.doneItemIds);
            setNote("");
            await onAfterSave();
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Сохраняю…" : done ? "Добавить отметку" : "Сохранить"}
      </button>
    </div>
  );
}
