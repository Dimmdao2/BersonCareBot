"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
  TreatmentProgramTestResultDetailRow,
} from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
  patientStageSectionShouldRender,
  splitPatientProgramStagesForDetailUi,
  selectCurrentWorkingStageForPatientDetail,
  countPatientCompletedPipelineStages,
  resolvePatientProgramControlRemainderDaysForPatientUi,
  expectedStageControlDeadlineIsoForPatientUi,
} from "@/modules/treatment-program/stage-semantics";
import {
  normalizeChecklistCountMap,
  normalizeChecklistLastMap,
} from "@/app/app/patient/treatment/normalizeTreatmentProgramChecklistMaps";
import { routePaths } from "@/app-layer/routes/paths";
import { parsePatientPlanTab, type PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import { DateTime } from "luxon";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import { flatExecIds, flatTestSlots } from "@/app/app/patient/treatment/patientProgramItemNavLists";
import {
  buildProgressTabProgramDaysLabel,
  sortByOrderThenId,
} from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";
import { PatientPlanHeroActive, PatientPlanHeroCompleted } from "@/app/app/patient/treatment/program-detail/PatientPlanHero";
import { PatientPlanTabStrip } from "@/app/app/patient/treatment/program-detail/PatientPlanTabStrip";
import { PatientPlanTabPanels } from "@/app/app/patient/treatment/program-detail/PatientPlanTabPanels";
import type { PatientPlanTodayRemindersCardProps } from "@/app/app/patient/treatment/program-detail/PatientPlanTodayRemindersCard";
import { PatientPlanTodayRemindersCard } from "@/app/app/patient/treatment/program-detail/PatientPlanTodayRemindersCard";

export function PatientTreatmentProgramDetailClient(props: {
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialProgramEvents?: TreatmentProgramEventRow[];
  appDisplayTimeZone: string;
  programDescription?: string | null;
  /** IANA для календарных суток пациента. */
  patientCalendarDayIana: string;
  /** Вкладка из `?tab=` (серверный первый рендер). */
  initialPlanTab?: PatientPlanTab;
  /** Верхняя карточка «напоминания сегодня» (только active). */
  planReminderStrip?: PatientPlanTodayRemindersCardProps | null;
  /** Пауза перед повторным «Выполнено» у простых пунктов плана (мин). */
  planItemDoneRepeatCooldownMinutes: number;
}) {
  const {
    appDisplayTimeZone,
    programDescription = null,
    initialProgramEvents = [],
    patientCalendarDayIana,
    initialPlanTab = "program",
    planReminderStrip = null,
    planItemDoneRepeatCooldownMinutes,
  } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<PatientPlanTab>(() => initialPlanTab);
  const [detail, setDetail] = useState(props.initial);

  const planTabQs = searchParams.get("tab");
  useEffect(() => {
    if (detail.status !== "active") return;
    /** Без `?tab=` канонически «Программа»; не подставлять `initialPlanTab` — после replace он устаревает. */
    const next =
      planTabQs != null && planTabQs !== "" ? parsePatientPlanTab(planTabQs) : "program";
    setActiveTab(next);
  }, [planTabQs, detail.status, detail.id]);

  const replacePlanTabInUrl = useCallback(
    (tab: PatientPlanTab) => {
      router.replace(routePaths.patientTreatmentProgram(detail.id, tab));
    },
    [router, detail.id],
  );

  useEffect(() => {
    void import("@/app/app/patient/treatment/PatientTreatmentTabProgram");
    void import("@/app/app/patient/treatment/PatientTreatmentTabRecommendations");
  }, []);
  const [_testResults, setTestResults] = useState(props.initialTestResults);
  const [programEvents, setProgramEvents] = useState(initialProgramEvents);
  const [error, setError] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByItemId, setDoneTodayCountByItemId] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByItemId, setLastDoneAtIsoByItemId] = useState<Record<string, string>>({});
  const [statsRefreshToken, setStatsRefreshToken] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    const id = detail.id;
    const [instRes, trRes, checklistRes, evRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/test-results`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/checklist-today`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/events`),
    ]);
    const data = (await instRes.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!instRes.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    const trData = (await trRes.json().catch(() => null)) as { ok?: boolean; results?: TreatmentProgramTestResultDetailRow[] };
    if (trRes.ok && trData.ok && trData.results) setTestResults(trData.results);
    const evData = (await evRes.json().catch(() => null)) as { ok?: boolean; events?: TreatmentProgramEventRow[] };
    if (evRes.ok && evData.ok && Array.isArray(evData.events)) setProgramEvents(evData.events);
    const chData = (await checklistRes.json().catch(() => null)) as {
      ok?: boolean;
      doneItemIds?: string[];
      doneTodayCountByItemId?: unknown;
      lastDoneAtIsoByItemId?: unknown;
    };
    if (data.item.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByItemId({});
      setLastDoneAtIsoByItemId({});
    } else if (checklistRes.ok && chData?.ok === true && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
      setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
      setLastDoneAtIsoByItemId(normalizeChecklistLastMap(chData.lastDoneAtIsoByItemId));
    }
    setStatsRefreshToken((t) => t + 1);
  }, [detail.id]);

  useEffect(() => {
    void (async () => {
      if (detail.status !== "active") {
        setDoneItemIds([]);
        setDoneTodayCountByItemId({});
        setLastDoneAtIsoByItemId({});
        return;
      }
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/checklist-today`,
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        doneItemIds?: string[];
        doneTodayCountByItemId?: unknown;
        lastDoneAtIsoByItemId?: unknown;
      };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) {
        setDoneItemIds(data.doneItemIds);
        setDoneTodayCountByItemId(normalizeChecklistCountMap(data.doneTodayCountByItemId));
        setLastDoneAtIsoByItemId(normalizeChecklistLastMap(data.lastDoneAtIsoByItemId));
      }
    })();
  }, [detail.id, detail.status]);

  useEffect(() => {
    if (detail.status !== "active") return;
    void fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/plan-opened`, {
      method: "POST",
    }).catch(() => {});
  }, [detail.id, detail.status]);

  const { stageZeroStages, currentWorkingStage } = useMemo(() => {
    const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
    const cur = selectCurrentWorkingStageForPatientDetail(pipeline);
    return {
      stageZeroStages: stageZero.filter((s) => patientStageSectionShouldRender(s, true)),
      currentWorkingStage: cur,
    };
  }, [detail.stages]);

  /** Этап для вкладки «Программа»: pipeline-этап или единственный «нулевой», если других этапов нет. */
  const programTabStage = useMemo(() => {
    if (currentWorkingStage) return currentWorkingStage;
    const hasPipeline = detail.stages.some((s) => s.sortOrder > 0);
    if (!hasPipeline && stageZeroStages[0]) return stageZeroStages[0];
    return null;
  }, [currentWorkingStage, detail.stages, stageZeroStages]);

  const stagesTimeline = useMemo(() => {
    const { archive, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
    const merged = [...archive, ...pipeline].filter((s) => s.sortOrder > 0);
    return sortByOrderThenId(merged);
  }, [detail.stages]);

  const stageCountNonZero = stagesTimeline.length;

  const awaitsStart =
    detail.status === "active" &&
    currentWorkingStage != null &&
    currentWorkingStage.status === "available";

  const pipelineLength = useMemo(
    () => detail.stages.filter((s) => s.sortOrder > 0).length,
    [detail.stages],
  );

  /** Первый пункт в порядке `nav=exec` (как на странице пункта), а не только composition modal. */
  const firstPendingProgramItemId = useMemo(() => {
    if (!programTabStage || detail.status !== "active") return null;
    const itemInteraction =
      programTabStage.status === "completed" || programTabStage.status === "skipped" ? "readOnly" : "full";
    let ordered = flatExecIds(programTabStage, itemInteraction);
    if (ordered.length === 0 && itemInteraction === "full") {
      ordered = flatExecIds(programTabStage, "readOnly");
    }
    const pending = ordered.find((id) => !doneItemIds.includes(id));
    return pending ?? ordered[0] ?? null;
  }, [programTabStage, doneItemIds, detail.status]);

  /** Вкладка «Прогресс» → первый тест в плоском списке (`nav=tests` + `testId`). */
  const progressCardTestsHref = useMemo(() => {
    if (!currentWorkingStage || detail.status !== "active") return null;
    const slots = flatTestSlots(currentWorkingStage);
    if (slots.length === 0) return null;
    const first = slots[0]!;
    return routePaths.patientTreatmentProgramItem(detail.id, first.itemId, "tests", "progress", first.testId);
  }, [currentWorkingStage, detail.status, detail.id]);

  /** Согласовано с вкладкой «Рекомендации»: persistent на рабочем этапе + persistent этапа 0 с фильтром «на поверхностях программы». */
  const recommendationListCount = useMemo(() => {
    let n = 0;
    if (currentWorkingStage) {
      n += currentWorkingStage.items.filter((it) => isPersistentRecommendation(it)).length;
    }
    for (const st of stageZeroStages) {
      n += st.items.filter(
        (it) =>
          isPersistentRecommendation(it) && isInstanceStageItemShownOnPatientProgramSurfaces(it),
      ).length;
    }
    return n;
  }, [currentWorkingStage, stageZeroStages]);

  const programTabSubtitle = useMemo(() => {
    if (!programTabStage) return "—";
    if (programTabStage.sortOrder === 0) return "Общие рекомендации";
    return `Этап ${programTabStage.sortOrder} из ${pipelineLength}`;
  }, [programTabStage, pipelineLength]);

  const progressTabProgramDaysLabel = buildProgressTabProgramDaysLabel(detail, patientCalendarDayIana, appDisplayTimeZone);

  const controlRemainderDaysForCard = resolvePatientProgramControlRemainderDaysForPatientUi(
    detail,
    DateTime.now(),
    patientCalendarDayIana,
  );
  const controlDeadlineIso = currentWorkingStage
    ? expectedStageControlDeadlineIsoForPatientUi(currentWorkingStage, DateTime.now(), patientCalendarDayIana)
    : null;
  const controlDateLine =
    controlDeadlineIso && appDisplayTimeZone ? formatBookingDateLongRu(controlDeadlineIso, appDisplayTimeZone) : null;
  const controlFallbackMessage =
    currentWorkingStage?.expectedDurationText?.trim() || "Срок консультации уточняется у врача.";
  /** Карточка контроля: после старта этапа (не «ожидает старта»), даже если нет срока в днях для расчёта даты. */
  const showNextControlCard =
    detail.status === "active" && currentWorkingStage != null && !awaitsStart;

  const selectTab = useCallback(
    (tab: PatientPlanTab) => {
      setActiveTab(tab);
      replacePlanTabInUrl(tab);
    },
    [replacePlanTabInUrl],
  );

  if (detail.status === "completed") {
    const passedStages = countPatientCompletedPipelineStages(detail.stages);
    return (
      <div className={patientInnerPageStackClass}>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <PatientPlanHeroCompleted
          detail={detail}
          appDisplayTimeZone={appDisplayTimeZone}
          programEvents={programEvents}
          passedStages={passedStages}
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

      <div className="flex flex-col">
        {detail.status === "active" && planReminderStrip ? (
          <PatientPlanTodayRemindersCard {...planReminderStrip} />
        ) : null}
        <PatientPlanHeroActive
          detail={detail}
          appDisplayTimeZone={appDisplayTimeZone}
          programEvents={programEvents}
          programDescription={programDescription}
          awaitsStart={awaitsStart}
          programTabStage={programTabStage}
          firstPendingProgramItemId={firstPendingProgramItemId}
        />

        <PatientPlanTabStrip
          activeTab={activeTab}
          onSelectTab={selectTab}
          programTabSubtitle={programTabSubtitle}
          recommendationListCount={recommendationListCount}
          progressTabProgramDaysLabel={progressTabProgramDaysLabel}
        />
      </div>

      <PatientPlanTabPanels
        activeTab={activeTab}
        detail={detail}
        programTabStage={programTabStage}
        pipelineLength={pipelineLength}
        appDisplayTimeZone={appDisplayTimeZone}
        embeddedChecklist={{
          doneItemIds,
          doneTodayCountByItemId,
          lastDoneAtIsoByItemId,
        }}
        onRefreshDetail={refresh}
        currentWorkingStage={currentWorkingStage}
        stageZeroStages={stageZeroStages}
        stagesTimeline={stagesTimeline}
        stageCountNonZero={stageCountNonZero}
        showNextControlCard={showNextControlCard}
        controlDateLine={controlDateLine}
        controlRemainderDaysForCard={controlRemainderDaysForCard}
        controlFallbackMessage={controlFallbackMessage}
        progressCardTestsHref={progressCardTestsHref}
        patientCalendarDayIana={patientCalendarDayIana}
        statsRefreshToken={statsRefreshToken}
        planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
      />
    </div>
  );
}
