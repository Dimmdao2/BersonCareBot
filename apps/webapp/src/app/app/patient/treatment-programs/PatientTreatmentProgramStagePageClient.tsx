"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { formatTreatmentProgramStageStatusRu } from "@/modules/treatment-program/types";
import {
  calendarDaysFromUtcIsoToNowInZone,
  countBlockingStagesBeforePatientStage,
  latestCompletedAtIsoAmongStageItems,
  patientTreatmentProgramStageScreenVariant,
} from "@/modules/treatment-program/stage-semantics";
import {
  PatientInstanceStageBody,
  PatientStageHeaderFields,
  patientStageHasHeaderFields,
} from "./PatientTreatmentProgramDetailClient";
import { normalizeChecklistCountMap } from "@/app/app/patient/treatment-programs/normalizeTreatmentProgramChecklistMaps";
import {
  patientCardClass,
  patientCardListSectionClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientStageTitleClass,
  patientInnerPageStackClass,
  patientPillClass,
  patientSurfaceWarningClass,
} from "@/shared/ui/patientVisual";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

function ruDayWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function ruStageWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "этапов";
  const mod10 = n % 10;
  if (mod10 === 1) return "этап";
  if (mod10 >= 2 && mod10 <= 4) return "этапа";
  return "этапов";
}

function pastStageHeroBadge(stage: Stage, appDisplayTimeZone: string): string {
  const latest = latestCompletedAtIsoAmongStageItems(stage);
  if (stage.status === "skipped") {
    if (!latest) return "Пропущен";
    const d = calendarDaysFromUtcIsoToNowInZone(latest, appDisplayTimeZone);
    if (d === 0) return "Пропущен сегодня";
    return `Пропущен ${d} ${ruDayWord(d)} назад`;
  }
  if (!latest) return "Завершён";
  const d = calendarDaysFromUtcIsoToNowInZone(latest, appDisplayTimeZone);
  if (d === 0) return "Завершён сегодня";
  return `Завершён ${d} ${ruDayWord(d)} назад`;
}

function blockingStagesCopy(allStages: Stage[], target: Stage): string {
  const n = countBlockingStagesBeforePatientStage(allStages, target);
  if (n <= 0) {
    return "Чтобы открыть этот этап, завершите текущий активный этап программы.";
  }
  if (n === 1) {
    return "Для открытия этапа необходимо завершить активный этап программы.";
  }
  return `Для открытия этапа необходимо завершить ещё ${n} ${ruStageWord(n)}.`;
}

export function PatientTreatmentProgramStagePageClient(props: {
  instanceId: string;
  stage: Stage;
  pipelineLength: number;
  allStages: Stage[];
  appDisplayTimeZone: string;
}) {
  const { instanceId, pipelineLength, allStages, appDisplayTimeZone } = props;
  const [currentStage, setCurrentStage] = useState<Stage>(props.stage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByItemId, setDoneTodayCountByItemId] = useState<Record<string, number>>({});

  const variant = useMemo(
    () => patientTreatmentProgramStageScreenVariant(currentStage),
    [currentStage],
  );

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items`;

  useEffect(() => {
    if (variant !== "interactive") return;
    void (async () => {
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`,
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        doneItemIds?: string[];
        doneTodayCountByItemId?: unknown;
      };
      if (!res.ok || !data?.ok || !Array.isArray(data.doneItemIds)) return;
      setDoneItemIds(data.doneItemIds);
      setDoneTodayCountByItemId(normalizeChecklistCountMap(data.doneTodayCountByItemId));
    })();
  }, [instanceId, variant]);

  const refresh = useCallback(async () => {
    setError(null);
    const [instRes, chRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}`),
      variant === "interactive"
        ? fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/checklist-today`)
        : Promise.resolve(null as Response | null),
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
    if (variant !== "interactive" || chRes == null) {
      return;
    }
    const chData = (await chRes.json().catch(() => null)) as {
      ok?: boolean;
      doneItemIds?: string[];
      doneTodayCountByItemId?: unknown;
    };
    if (data.item.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByItemId({});
    } else if (chRes.ok && chData?.ok === true && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
      setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
    }
  }, [instanceId, props.stage.id, variant]);

  const isStageZero = currentStage.sortOrder === 0;

  if (variant === "futureLocked" && !isStageZero) {
    const planBlock = patientStageHasHeaderFields({
      description: currentStage.description,
      goals: currentStage.goals,
      objectives: currentStage.objectives,
      expectedDurationDays: currentStage.expectedDurationDays,
      expectedDurationText: currentStage.expectedDurationText,
    });

    return (
      <div className={patientInnerPageStackClass}>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 pt-3 lg:p-5")}>
          <p className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
            Этап {currentStage.sortOrder} из {pipelineLength}
          </p>
          <h2 className={cn(patientStageTitleClass, "mt-1")}>{currentStage.title}</h2>
          <p className="mt-3">
            <span className={patientPillClass}>Запланирован</span>
          </p>
        </div>

        {planBlock ? (
          <PatientStageHeaderFields stage={currentStage} planPreview />
        ) : null}

        <section
          className={cn(patientSurfaceWarningClass, "rounded-lg border px-3 py-3")}
          aria-live="polite"
        >
          <p className={cn(patientMutedTextClass, "text-sm leading-snug")}>
            {blockingStagesCopy(allStages, currentStage)}
          </p>
        </section>
      </div>
    );
  }

  if (variant === "pastReadOnly" && !isStageZero) {
    return (
      <div className={patientInnerPageStackClass}>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 pt-3 lg:p-5")}>
          <p className={cn(patientMutedTextClass, "text-xs uppercase tracking-wide")}>
            Этап {currentStage.sortOrder} из {pipelineLength}
          </p>
          <h2 className={cn(patientStageTitleClass, "mt-1")}>{currentStage.title}</h2>
          <p className="mt-3">
            <span className={patientPillClass}>{pastStageHeroBadge(currentStage, appDisplayTimeZone)}</span>
          </p>
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
          itemInteraction="readOnly"
          doneItemIds={[]}
          onDoneItemIds={() => {}}
          todayCountByStageItemId={undefined}
          heading={<h3 className={patientSectionTitleClass}>Назначения этапа</h3>}
        />
      </div>
    );
  }

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
        itemInteraction="full"
        doneItemIds={doneItemIds}
        onDoneItemIds={setDoneItemIds}
        todayCountByStageItemId={doneTodayCountByItemId}
        hideStageDescription={isStageZero}
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
