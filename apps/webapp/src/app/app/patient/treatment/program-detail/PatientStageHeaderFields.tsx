"use client";

import { cn } from "@/lib/utils";
import {
  patientBodyTextClass,
  patientCardNestedListSurfaceClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";

export function patientStageHasHeaderFields(stage: {
  description?: string | null;
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
}): boolean {
  return Boolean(
    stage.description?.trim() ||
      stage.goals?.trim() ||
      stage.objectives?.trim() ||
      stage.expectedDurationDays != null ||
      Boolean(stage.expectedDurationText?.trim()),
  );
}

export function PatientStageHeaderFields(props: {
  stage: {
    description?: string | null;
    goals: string | null;
    objectives: string | null;
    expectedDurationDays: number | null;
    expectedDurationText: string | null;
  };
  /** Узкие отступы — как у списка этапов на странице программы. */
  compactSpacing?: boolean;
  /** Без блока «ожидаемый срок» (экран запланированного этапа). */
  planPreview?: boolean;
  /** Скрыть блок описания (например этап 0 «Рекомендации» — без «Описание этапа» и текста из поля). */
  hideDescription?: boolean;
}) {
  const { stage, compactSpacing, planPreview = false, hideDescription = false } = props;
  const durationLine = [
    stage.expectedDurationDays != null ? `${stage.expectedDurationDays} дн.` : null,
    stage.expectedDurationText?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const showDescription = !hideDescription && Boolean(stage.description?.trim());
  const hasRenderableFields =
    showDescription ||
    Boolean(stage.goals?.trim()) ||
    Boolean(stage.objectives?.trim()) ||
    (!planPreview && Boolean(durationLine));

  if (!hasRenderableFields) return null;

  return (
    <div
      className={cn(
        compactSpacing ? patientCardNestedListSurfaceClass : patientSectionSurfaceClass,
        "shadow-none",
        compactSpacing ? "mb-3" : "mb-4",
      )}
    >
      {showDescription ? (
        <div>
          <h3 className={patientSectionTitleClass}>Описание этапа</h3>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{(stage.description ?? "").trim()}</p>
        </div>
      ) : null}
      {stage.goals?.trim() ? (
        <div>
          <h3 className={patientSectionTitleClass}>Цель</h3>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.goals.trim()}</p>
        </div>
      ) : null}
      {stage.objectives?.trim() ? (
        <div>
          <h3 className={patientSectionTitleClass}>Задачи</h3>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.objectives.trim()}</p>
        </div>
      ) : null}
      {!planPreview && durationLine ? (
        <div>
          <h3 className={patientSectionTitleClass}>Ожидаемый срок</h3>
          <p className={cn(patientMutedTextClass, "mt-1 text-sm")}>{durationLine}</p>
        </div>
      ) : null}
    </div>
  );
}
