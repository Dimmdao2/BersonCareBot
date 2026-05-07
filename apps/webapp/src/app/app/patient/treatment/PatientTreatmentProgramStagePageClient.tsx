"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { formatTreatmentProgramStageStatusRu } from "@/modules/treatment-program/types";
import {
  calendarDaysFromUtcIsoToNowInZone,
  countBlockingStagesBeforePatientStage,
  latestCompletedAtIsoAmongStageItems,
  patientTreatmentProgramStageScreenVariant,
} from "@/modules/treatment-program/stage-semantics";
import { PatientInstanceStageBody, PatientStageHeaderFields, patientStageHasHeaderFields } from "./PatientTreatmentProgramDetailClient";
import { PatientTreatmentProgramStagePageProgramSection } from "./PatientTreatmentProgramStagePageProgramSection";
import { PatientTreatmentProgramStageRecommendationsCollapsible } from "./PatientTreatmentProgramStageRecommendationsCollapsible";
import {
  normalizeChecklistCountMap,
  normalizeChecklistLastMap,
} from "@/app/app/patient/treatment/normalizeTreatmentProgramChecklistMaps";
import {
  patientCardListSectionClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientStageControlDaysBadgeClass,
  patientStageGoalsCollapsiblePanelClass,
  patientStageGoalsCollapsibleTriggerClass,
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

function StageDescriptionBlock(props: { text: string | null | undefined }) {
  const raw = (props.text ?? "").trim();
  const [expanded, setExpanded] = useState(false);
  const [clampedOverflow, setClampedOverflow] = useState(false);
  const pRef = useRef<HTMLParagraphElement>(null);

  const measureClampedOverflow = useCallback(() => {
    const el = pRef.current;
    if (!el || expanded) return;
    setClampedOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!raw || expanded) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => measureClampedOverflow());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [expanded, measureClampedOverflow, raw]);

  useEffect(() => {
    const el = pRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureClampedOverflow());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureClampedOverflow, raw]);

  if (!raw) return null;

  const showToggle = clampedOverflow;

  return (
    <div className="mt-2">
      <p
        ref={pRef}
        className={cn(!expanded && "line-clamp-3", patientMutedTextClass, "whitespace-pre-wrap text-sm leading-snug")}
      >
        {raw}
      </p>
      {showToggle ? (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            className={cn(
              patientMutedTextClass,
              "cursor-pointer text-xs underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
            )}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "свернуть" : "развернуть"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PatientTreatmentProgramStagePageClient(props: {
  instanceId: string;
  stage: Stage;
  pipelineLength: number;
  allStages: Stage[];
  appDisplayTimeZone: string;
  /** Внутри вкладки «Программа» на detail: без hero, без рекомендаций и «контроль через». */
  embedded?: boolean;
}) {
  const { instanceId, pipelineLength, allStages, appDisplayTimeZone, embedded = false } = props;
  const [currentStage, setCurrentStage] = useState<Stage>(props.stage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByItemId, setDoneTodayCountByItemId] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByItemId, setLastDoneAtIsoByItemId] = useState<Record<string, string>>({});
  const [totalCompletionEventsByItemId, setTotalCompletionEventsByItemId] = useState<Record<string, number>>({});

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
        lastDoneAtIsoByItemId?: unknown;
        totalCompletionEventsByItemId?: unknown;
      };
      if (!res.ok || !data?.ok || !Array.isArray(data.doneItemIds)) return;
      setDoneItemIds(data.doneItemIds);
      setDoneTodayCountByItemId(normalizeChecklistCountMap(data.doneTodayCountByItemId));
      setLastDoneAtIsoByItemId(normalizeChecklistLastMap(data.lastDoneAtIsoByItemId));
      setTotalCompletionEventsByItemId(normalizeChecklistCountMap(data.totalCompletionEventsByItemId));
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
      lastDoneAtIsoByItemId?: unknown;
      totalCompletionEventsByItemId?: unknown;
    };
    if (data.item.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByItemId({});
      setLastDoneAtIsoByItemId({});
      setTotalCompletionEventsByItemId({});
    } else if (chRes.ok && chData?.ok === true && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
      setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
      setLastDoneAtIsoByItemId(normalizeChecklistLastMap(chData.lastDoneAtIsoByItemId));
      setTotalCompletionEventsByItemId(normalizeChecklistCountMap(chData.totalCompletionEventsByItemId));
    }
  }, [instanceId, props.stage.id, variant]);

  const isStageZero = currentStage.sortOrder === 0;
  const contentBlocked =
    !isStageZero && (currentStage.status === "locked" || currentStage.status === "skipped");

  const hasGoalsCollapsible =
    Boolean(currentStage.goals?.trim()) || Boolean(currentStage.objectives?.trim());

  const goalsObjectivesBlock = hasGoalsCollapsible ? (
    <Collapsible
      className={cn(
        patientCardListSectionClass,
        "overflow-hidden bg-white p-0 lg:p-0",
        embedded
          ? "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]"
          : cn(
              "rounded-t-none border-t-0",
              "rounded-b-[var(--patient-card-radius-mobile)] lg:rounded-b-[var(--patient-card-radius-desktop)]",
            ),
      )}
    >
        <CollapsibleTrigger className={patientStageGoalsCollapsibleTriggerClass}>
          <div className="mb-0 flex min-w-0 w-full items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ScrollText className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
              <span className="truncate">Цели и задачи</span>
            </div>
            <ChevronDown
              className="size-3.5 shrink-0 text-neutral-400 transition-transform group-data-[open]/collapsible:rotate-180"
              aria-hidden
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className={patientStageGoalsCollapsiblePanelClass}>
          {currentStage.goals?.trim() ? (
            <div>
              <h3 className="text-xs font-semibold text-[#444444]">Цель</h3>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[#444444]">
                {currentStage.goals.trim()}
              </p>
            </div>
          ) : null}
          {currentStage.objectives?.trim() ? (
            <div className={currentStage.goals?.trim() ? "mt-3" : ""}>
              <h3 className="text-xs font-semibold text-[#444444]">Задачи</h3>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-[#444444]">
                {currentStage.objectives.trim()}
              </p>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    ) : null;

  const controlBadge =
    currentStage.expectedDurationDays != null &&
    currentStage.expectedDurationDays > 0 &&
    Number.isFinite(currentStage.expectedDurationDays) ? (
      <div
        className={cn(
          "rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-border)] px-3 py-2 shadow-[var(--patient-shadow-card-mobile)] lg:rounded-[var(--patient-card-radius-desktop)] lg:px-4 lg:shadow-[var(--patient-shadow-card-desktop)]",
          patientStageControlDaysBadgeClass,
        )}
      >
        <p className="m-0 text-sm font-medium text-[#444444]">
          Контроль через {currentStage.expectedDurationDays} {ruDayWord(currentStage.expectedDurationDays)}
        </p>
      </div>
    ) : null;

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

        {!embedded ? (
          <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 pt-3 lg:p-5")}>
            <span className={cn(patientPillClass, "absolute right-3 top-3 lg:right-4 lg:top-4")}>Запланирован</span>
            <p className={cn(patientMutedTextClass, "pr-24 text-xs uppercase tracking-wide")}>
              Этап {currentStage.sortOrder} из {pipelineLength}
            </p>
            <h2 className={cn(patientStageTitleClass, "mt-1 pr-24")}>{currentStage.title}</h2>
            <StageDescriptionBlock
              key={`${currentStage.id}:${currentStage.description ?? ""}`}
              text={currentStage.description}
            />
          </div>
        ) : null}

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

        {!embedded ? (
          <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 pt-3 lg:p-5")}>
            <span
              className={cn(
                patientPillClass,
                "absolute right-3 top-3 max-w-[min(12rem,calc(100%-1rem))] truncate text-right lg:right-4 lg:top-4",
              )}
            >
              {pastStageHeroBadge(currentStage, appDisplayTimeZone)}
            </span>
            <p className={cn(patientMutedTextClass, "pr-28 text-xs uppercase tracking-wide")}>
              Этап {currentStage.sortOrder} из {pipelineLength}
            </p>
            <h2 className={cn(patientStageTitleClass, "mt-1 pr-28")}>{currentStage.title}</h2>
            <StageDescriptionBlock
              key={`${currentStage.id}:${currentStage.description ?? ""}`}
              text={currentStage.description}
            />
          </div>
        ) : null}

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

      {!embedded ? (
        <div className={cn(hasGoalsCollapsible && "flex flex-col gap-0")}>
          <div
            className={cn(
              patientHomeCardHeroClass,
              "relative isolate overflow-hidden p-4 pt-3 lg:p-5",
              hasGoalsCollapsible &&
                "rounded-b-none rounded-t-[var(--patient-hero-radius-mobile)] lg:rounded-b-none lg:rounded-t-[var(--patient-hero-radius-desktop)]",
            )}
          >
            <span
              className={cn(
                patientPillClass,
                "absolute right-3 top-3 max-w-[min(10rem,calc(100%-1rem))] truncate text-right text-xs lg:right-4 lg:top-4",
              )}
            >
              {formatTreatmentProgramStageStatusRu(currentStage.status)}
            </span>
            {isStageZero ? (
              <h2 className={cn(patientStageTitleClass, "pr-24")}>Общие рекомендации</h2>
            ) : (
              <>
                <p className={cn(patientMutedTextClass, "pr-24 text-xs uppercase tracking-wide")}>
                  Этап {currentStage.sortOrder} из {pipelineLength}
                </p>
                <h2 className={cn(patientStageTitleClass, "mt-1 pr-24")}>{currentStage.title}</h2>
              </>
            )}
            {!isStageZero ? (
              <StageDescriptionBlock
                key={`${currentStage.id}:${currentStage.description ?? ""}`}
                text={currentStage.description}
              />
            ) : null}
            {isStageZero && currentStage.description?.trim() ? (
              <StageDescriptionBlock
                key={`${currentStage.id}:${currentStage.description ?? ""}`}
                text={currentStage.description}
              />
            ) : null}
          </div>
          {goalsObjectivesBlock}
        </div>
      ) : (
        goalsObjectivesBlock
      )}
      {patientStageHasHeaderFields({
        description: null,
        goals: null,
        objectives: null,
        expectedDurationDays: currentStage.expectedDurationDays,
        expectedDurationText: currentStage.expectedDurationText,
      }) ? (
        <PatientStageHeaderFields
          stage={{
            description: null,
            goals: null,
            objectives: null,
            expectedDurationDays: currentStage.expectedDurationDays,
            expectedDurationText: currentStage.expectedDurationText,
          }}
          compactSpacing={embedded}
          planPreview={embedded}
        />
      ) : null}
      {!embedded ? controlBadge : null}

      {!embedded ? (
        <PatientTreatmentProgramStageRecommendationsCollapsible
          stage={currentStage}
          base={base}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          contentBlocked={contentBlocked}
        />
      ) : null}

      <PatientTreatmentProgramStagePageProgramSection
        stage={currentStage}
        base={base}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        refresh={refresh}
        contentBlocked={contentBlocked}
        itemInteraction="full"
        doneItemIds={doneItemIds}
        onDoneItemIds={setDoneItemIds}
        lastDoneAtIsoByItemId={lastDoneAtIsoByItemId}
        totalCompletionEventsByItemId={totalCompletionEventsByItemId}
        appDisplayTimeZone={appDisplayTimeZone}
      />
    </div>
  );
}
