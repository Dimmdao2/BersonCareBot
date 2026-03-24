"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { createSymptomTracking } from "./actions";
import type { SymptomSide } from "@/modules/diaries/types";

export function CreateTrackingForm() {
  const [symptomTypeRefId, setSymptomTypeRefId] = useState<string | null>(null);
  const [regionRefId, setRegionRefId] = useState<string | null>(null);
  const [diagnosisRefId, setDiagnosisRefId] = useState<string | null>(null);
  const [stageRefId, setStageRefId] = useState<string | null>(null);
  const [side, setSide] = useState<SymptomSide | null>(null);

  return (
    <form
      action={createSymptomTracking}
      className="stack gap-4"
    >
      <p className="empty-state mb-0">
        Укажите название симптома и/или тип из справочника — после сохранения вы сможете вести дневник по нему на
        этой странице.
      </p>
      <label className="stack gap-1">
        <span className="eyebrow">Название</span>
        <Input
          type="text"
          name="symptomTitle"
          className="auth-input"
          placeholder="Название симптома (необязательно, если выбран тип)"
          autoComplete="off"
        />
      </label>
      <input type="hidden" name="symptomTypeRefId" value={symptomTypeRefId ?? ""} />
      <input type="hidden" name="regionRefId" value={regionRefId ?? ""} />
      <input type="hidden" name="diagnosisRefId" value={diagnosisRefId ?? ""} />
      <input type="hidden" name="stageRefId" value={stageRefId ?? ""} />
      <input type="hidden" name="side" value={side ?? ""} />

      <label className="stack gap-1">
        <span className="eyebrow">Тип симптома</span>
        <ReferenceSelect
          categoryCode="symptom_type"
          value={symptomTypeRefId}
          onChange={(id, _label) => setSymptomTypeRefId(id)}
          placeholder="Выберите тип"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="stack min-w-[200px] flex-1 gap-1">
          <span className="eyebrow">Регион</span>
          <ReferenceSelect
            categoryCode="body_region"
            value={regionRefId}
            onChange={(id, _label) => setRegionRefId(id)}
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
                side === s ? "border-primary bg-primary/10" : "border-border bg-muted/50"
              )}
              onClick={() => setSide(side === s ? null : s)}
            >
              {s === "left" ? "Лев" : s === "right" ? "Прав" : "Обе"}
            </button>
          ))}
        </div>
      </div>

      <label className="stack gap-1">
        <span className="eyebrow">Диагноз (текст)</span>
        <Input type="text" name="diagnosisText" placeholder="Свободный текст" maxLength={500} />
      </label>

      <label className="stack gap-1">
        <span className="eyebrow">Диагноз (справочник)</span>
        <ReferenceSelect
          categoryCode="diagnosis"
          value={diagnosisRefId}
          onChange={(id, _label) => setDiagnosisRefId(id)}
          placeholder="Из справочника"
        />
      </label>

      <label className="stack gap-1">
        <span className="eyebrow">Стадия</span>
        <ReferenceSelect
          categoryCode="disease_stage"
          value={stageRefId}
          onChange={(id, _label) => setStageRefId(id)}
          placeholder="Стадия заболевания"
        />
      </label>

      <button type="submit" className="button">
        Добавить
      </button>
    </form>
  );
}
