"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { patientButtonPrimaryClass, patientFormSurfaceClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

export type ProgramItemCompleteDialogPayload = {
  perceivedDifficulty: "easy" | "medium" | "hard";
  reps?: number;
  weightKg?: number;
};

function parseOptionalPositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseOptionalNonNegativeNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

export function ProgramItemCompleteDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ProgramItemCompleteDialogPayload) => Promise<void>;
  submitting: boolean;
}) {
  const { open, onOpenChange, onSubmit, submitting } = props;
  const [difficulty, setDifficulty] = useState<ProgramItemCompleteDialogPayload["perceivedDifficulty"]>("medium");
  const [repsRaw, setRepsRaw] = useState("");
  const [weightRaw, setWeightRaw] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg border border-[var(--patient-border)] shadow-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отметить выполнение</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label className={cn(patientMutedTextClass, "text-xs")}>Сложность</Label>
            <RadioGroup
              value={difficulty}
              onValueChange={(next) => setDifficulty(next as ProgramItemCompleteDialogPayload["perceivedDifficulty"])}
              className="grid grid-cols-1 gap-2"
              aria-label="Оценка сложности"
            >
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--patient-border)] px-2.5 py-2">
                <RadioGroupItem value="easy" />
                <span className="text-sm">Легко</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--patient-border)] px-2.5 py-2">
                <RadioGroupItem value="medium" />
                <span className="text-sm">Нормально</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--patient-border)] px-2.5 py-2">
                <RadioGroupItem value="hard" />
                <span className="text-sm">Тяжело</span>
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="patient-item-complete-reps" className={cn(patientMutedTextClass, "text-xs")}>
                Повторения
              </Label>
              <Input
                id="patient-item-complete-reps"
                inputMode="numeric"
                autoComplete="off"
                value={repsRaw}
                onChange={(e) => setRepsRaw(e.target.value)}
                className={cn(patientFormSurfaceClass, "h-9 text-sm")}
                placeholder="Например, 12"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="patient-item-complete-weight" className={cn(patientMutedTextClass, "text-xs")}>
                Вес, кг
              </Label>
              <Input
                id="patient-item-complete-weight"
                inputMode="decimal"
                autoComplete="off"
                value={weightRaw}
                onChange={(e) => setWeightRaw(e.target.value)}
                className={cn(patientFormSurfaceClass, "h-9 text-sm")}
                placeholder="Например, 5"
                disabled={submitting}
              />
            </div>
          </div>

          <Button
            type="button"
            className={cn(patientButtonPrimaryClass, "w-full sm:w-auto")}
            disabled={submitting}
            onClick={() =>
              void onSubmit({
                perceivedDifficulty: difficulty,
                reps: parseOptionalPositiveInt(repsRaw),
                weightKg: parseOptionalNonNegativeNumber(weightRaw),
              })
            }
          >
            {submitting ? "Сохраняю..." : "Записать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
