"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { SegmentControl } from "@/components/common/controls/SegmentControl";
import { createSymptomTracking } from "./actions";
import type { SymptomSide } from "@/modules/diaries/types";

const SIDE_OPTIONS: { value: SymptomSide; label: string }[] = [
  { value: "left", label: "Лев" },
  { value: "right", label: "Прав" },
  { value: "both", label: "Обе" },
];

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
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Название</span>
        <Input
          type="text"
          name="symptomTitle"
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
        <div className="flex flex-col gap-4 border-l-2 border-primary/20 pl-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Тип симптома</span>
            <ReferenceSelect
              categoryCode="symptom_type"
              value={symptomTypeRefId}
              onChange={(id) => setSymptomTypeRefId(id)}
              placeholder="Выберите тип"
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Регион</span>
              <ReferenceSelect
                categoryCode="body_region"
                value={regionRefId}
                onChange={(id) => setRegionRefId(id)}
                placeholder="Область тела"
              />
            </label>
            <SegmentControl
              options={SIDE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={side ?? ""}
              onChange={(v) => {
                const next = v as SymptomSide;
                setSide(side === next ? null : next);
              }}
              aria-label="Сторона"
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Диагноз (текст, только для вас)</span>
            <Input type="text" name="diagnosisText" placeholder="Свободный текст" maxLength={500} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Диагноз (справочник)</span>
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

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Стадия</span>
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
