"use client";

import { useCallback, useEffect, useState } from "react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import { PatientInstanceStageBody } from "./PatientTreatmentProgramDetailClient";
import {
  patientCardClass,
  patientCardListSectionClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientStageTitleClass,
  patientInnerPageStackClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

export function PatientTreatmentProgramStagePageClient(props: {
  instanceId: string;
  stage: Stage;
  pipelineLength: number;
}) {
  const { instanceId, pipelineLength } = props;
  const [currentStage, setCurrentStage] = useState<Stage>(props.stage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items`;

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`,
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) setDoneItemIds(data.doneItemIds);
    })();
  }, [instanceId]);

  const refresh = useCallback(async () => {
    setError(null);
    const [instRes, chRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`),
    ]);
    const data = (await instRes.json().catch(() => null)) as {
      ok?: boolean;
      item?: TreatmentProgramInstanceDetail;
    };
    if (!instRes.ok || !data?.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    const updated = data.item.stages.find((s) => s.id === props.stage.id);
    if (updated) setCurrentStage(updated);
    const chData = (await chRes.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
    if (chRes.ok && chData?.ok && Array.isArray(chData.doneItemIds)) setDoneItemIds(chData.doneItemIds);
  }, [instanceId, props.stage.id]);

  const isStageZero = currentStage.sortOrder === 0;

  return (
    <div className={patientInnerPageStackClass}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className={patientCardClass}>
        {isStageZero ? (
          <>
            <h2 className={patientStageTitleClass}>Общие рекомендации</h2>
            <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
              {formatTreatmentProgramStageStatusRu(currentStage.status)}
            </p>
          </>
        ) : (
          <>
            <p className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
              Этап {currentStage.sortOrder} из {pipelineLength}
            </p>
            <h2 className={cn(patientStageTitleClass, "mt-1")}>{currentStage.title}</h2>
            <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
              {formatTreatmentProgramStageStatusRu(currentStage.status)}
            </p>
          </>
        )}
      </div>

      <PatientInstanceStageBody
        instanceId={instanceId}
        stage={currentStage}
        base={base}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        refresh={refresh}
        ignoreStageLockForContent={isStageZero}
        surfaceClass={cn(patientCardListSectionClass, "flex flex-col gap-4")}
        doneItemIds={doneItemIds}
        onDoneItemIds={setDoneItemIds}
        heading={
          isStageZero ? (
            <h3 className={patientSectionTitleClass}>Назначения этапа</h3>
          ) : (
            <>
              <h3 className={patientSectionTitleClass}>Назначения этапа</h3>
              <span className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
                {formatTreatmentProgramStageStatusRu(currentStage.status)}
              </span>
            </>
          )
        }
      />
    </div>
  );
}
