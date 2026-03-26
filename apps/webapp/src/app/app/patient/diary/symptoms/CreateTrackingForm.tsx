"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { createSymptomTracking } from "./actions";
import type { SymptomSide } from "@/modules/diaries/types";

export function CreateTrackingForm() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [symptomTypeRefId, setSymptomTypeRefId] = useState<string | null>(null);
  const [regionRefId, setRegionRefId] = useState<string | null>(null);
  const [diagnosisRefId, setDiagnosisRefId] = useState<string | null>(null);
  const [stageRefId, setStageRefId] = useState<string | null>(null);
  const [side, setSide] = useState<SymptomSide | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        startTransition(async () => {
          const result = await createSymptomTracking(fd);
          if (result.ok) {
            toast.success("Симптом добавлен");
            form.reset();
            setShowAdvanced(false);
            setSymptomTypeRefId(null);
            setRegionRefId(null);
            setDiagnosisRefId(null);
            setStageRefId(null);
            setSide(null);
          } else {
            toast.error("Укажите название или выберите тип в блоке «Дополнительно»");
          }
        });
      }}
      className="stack gap-4"
    >
      <label className="stack gap-1">
        <span className="eyebrow">Название</span>
        <Input
          type="text"
          name="symptomTitle"
          className="auth-input"
          placeholder="Название симптома"
          autoComplete="off"
          required={!showAdvanced}
        />
      </label>

      <input type="hidden" name="symptomTypeRefId" value={symptomTypeRefId ?? ""} />
      <input type="hidden" name="regionRefId" value={regionRefId ?? ""} />
      <input type="hidden" name="diagnosisRefId" value={diagnosisRefId ?? ""} />
      <input type="hidden" name="stageRefId" value={stageRefId ?? ""} />
      <input type="hidden" name="side" value={side ?? ""} />

      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-primary"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? "Скрыть дополнительно" : "Дополнительно"}
      </Button>

      {showAdvanced ? (
        <div className="stack gap-4 border-l-2 border-primary/20 pl-3">
          <label className="stack gap-1">
            <span className="eyebrow">Тип симптома</span>
            <ReferenceSelect
              categoryCode="symptom_type"
              value={symptomTypeRefId}
              onChange={(id) => setSymptomTypeRefId(id)}
              placeholder="Выберите тип"
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <label className="stack min-w-[200px] flex-1 gap-1">
              <span className="eyebrow">Регион</span>
              <ReferenceSelect
                categoryCode="body_region"
                value={regionRefId}
                onChange={(id) => setRegionRefId(id)}
                placeholder="Область тела"
              />
            </label>
            <div className="flex gap-1">
              <span className="sr-only">Сторона</span>
              {(["left", "right", "both"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs",
                    side === s ? "border-primary bg-primary/10" : "border-border bg-muted/50",
                  )}
                  onClick={() => setSide(side === s ? null : s)}
                >
                  {s === "left" ? "Лев" : s === "right" ? "Прав" : "Обе"}
                </button>
              ))}
            </div>
          </div>

          <label className="stack gap-1">
            <span className="eyebrow">Диагноз (текст, только для вас)</span>
            <Input type="text" name="diagnosisText" placeholder="Свободный текст" maxLength={500} />
          </label>

          <label className="stack gap-1">
            <span className="eyebrow">Диагноз (справочник)</span>
            <span className="text-xs text-muted-foreground">
              Только выбор из списка; новые позиции добавляет администратор.
            </span>
            <ReferenceSelect
              categoryCode="diagnosis"
              value={diagnosisRefId}
              onChange={(id) => setDiagnosisRefId(id)}
              placeholder="Из справочника"
            />
          </label>

          <label className="stack gap-1">
            <span className="eyebrow">Стадия</span>
            <ReferenceSelect
              categoryCode="disease_stage"
              value={stageRefId}
              onChange={(id) => setStageRefId(id)}
              placeholder="Стадия заболевания"
            />
          </label>
        </div>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Добавляю…" : "Добавить"}
      </Button>
    </form>
  );
}
