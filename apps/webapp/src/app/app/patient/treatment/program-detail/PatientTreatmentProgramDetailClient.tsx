"use client";

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment/PatientProgramStageItemModal";
import { PatientModalDialogContent } from "@/shared/ui/patient/PatientModalDialogContent";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  patientLfkDifficultySelectItems,
  patientTestQualDecisionSelectItems,
} from "@/shared/ui/selectOpaqueValueLabels";
import {
  CheckCircle2,
  CalendarCheck,
  PlayCircle,
  Play,
  List,
  Lock,
  CornerDownRight,
  Info,
  Dumbbell,
  ScrollText,
} from "lucide-react";
import type {
  NormalizedTestDecision,
  TreatmentProgramInstanceDetail,
  TreatmentProgramEventRow,
  TreatmentProgramTestResultDetailRow,
} from "@/modules/treatment-program/types";
import {
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramEventTypeRu,
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isInstanceStageItemShownInPatientCompositionModal,
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
  isTreatmentProgramInstanceSystemStageGroup,
  patientInstanceSystemGroupHasVisibleItems,
  patientStageItemShowsNewBadge,
  patientStageSectionShouldRender,
  splitPatientProgramStagesForDetailUi,
  selectCurrentWorkingStageForPatientDetail,
  countPatientCompletedPipelineStages,
  formatRelativePatientCalendarDayRu,
  sortDoctorInstanceStageGroupsForDisplay,
  resolvePatientProgramControlRemainderDaysForPatientUi,
  resolvePatientProgramProgressDaysForPatientUi,
  expectedStageControlDeadlineIsoForPatientUi,
} from "@/modules/treatment-program/stage-semantics";
import { listLfkSnapshotExerciseLines, programActionDoneActivityKey } from "@/modules/treatment-program/programActionActivityKey";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/testSetSnapshotView";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import {
  normalizeChecklistCountMap,
  normalizeChecklistLastMap,
} from "@/app/app/patient/treatment/normalizeTreatmentProgramChecklistMaps";
import {
  mergeLastActivityDisplayedIso,
  parseSnapshotMediaForRowThumb,
  pickRecommendationRowPreviewMedia,
  parseRecommendationMediaFromSnapshot,
  recommendationBodyMdPreviewPlain,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";
import {
  patientCardListSectionClass,
  patientCardNestedListSurfaceClass,
  patientListItemClass,
  patientMutedTextClass,
  patientHeroPrimaryActionClass,
  patientPrimaryActionClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
  patientBodyTextClass,
  patientPillClass,
  patientFormSurfaceClass,
  patientSurfaceWarningClass,
  patientButtonSuccessClass,
  patientButtonWarningOutlineClass,
  patientLineClamp2Class,
  patientHeroTitleBaseClass,
  patientInnerHeroTitleTypographyClass,
  patientBadgeDangerClass,
  patientBadgePrimaryClass,
  patientInnerPageStackClass,
  patientCompactActionClass,
} from "@/shared/ui/patientVisual";
import { DateTime } from "luxon";
import { formatBookingDateLongRu, formatBookingDateTimeShortStyleRu } from "@/shared/lib/formatBusinessDateTime";
import { flatOrderedProgramCompositionItemIds } from "@/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection";
import { PatientProgramBlockHeading } from "@/app/app/patient/treatment/program-detail/PatientProgramBlockHeading";
import { PatientProgramPassageStatisticsSection } from "@/app/app/patient/treatment/program-detail/PatientProgramPassageStatisticsSection";

const PatientTreatmentTabProgramLazy = lazy(() =>
  import("@/app/app/patient/treatment/PatientTreatmentTabProgram").then((m) => ({ default: m.PatientTreatmentTabProgram })),
);
const PatientTreatmentTabRecommendationsLazy = lazy(() =>
  import("@/app/app/patient/treatment/PatientTreatmentTabRecommendations").then((m) => ({
    default: m.PatientTreatmentTabRecommendations,
  })),
);

/**
 * Строки списков на странице программы лечения и на странице этапа (тот же клиентский модуль).
 * Плотнее {@link patientListItemClass}, чтобы не менять глобальный примитив для других экранов пациента.
 */
const patientTreatmentProgramListItemClass = cn(patientListItemClass, "p-2 lg:p-2.5");

function formatPatientTestResultRawValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return String(raw);
  }
  const o = raw as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.score === "number" && !Number.isNaN(o.score)) parts.push(`Балл: ${o.score}`);
  if (typeof o.note === "string" && o.note.trim()) parts.push(`Комментарий: ${o.note.trim()}`);
  if (typeof o.value === "string" && o.value.trim()) parts.push(`Значение: ${o.value.trim()}`);
  if (parts.length > 0) return parts.join(" · ");
  const keys = Object.keys(o);
  if (keys.length === 0) return "Без деталей";
  return keys.map((k) => `${k}: ${JSON.stringify(o[k])}`).join("; ");
}

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

type InstanceStageRow = TreatmentProgramInstanceDetail["stages"][number];

/** Макс. зелёных точек «сегодня» в модалке — остаток числом (а11y через aria-label). */
const MAX_COMPOSITION_TODAY_DOTS = 24;

/** Число отметок «сегодня» для строки модалки: по ключу активности и с распределением агрегата элемента ЛФК по упражнениям. */
function compositionModalTodayDoneCount(params: {
  parentItem: InstanceStageRow["items"][number];
  activityKey: string;
  doneTodayCountByActivityKey: Readonly<Record<string, number>>;
  doneTodayCountByItemId: Readonly<Record<string, number>>;
}): number {
  const { parentItem, activityKey, doneTodayCountByActivityKey, doneTodayCountByItemId } = params;
  const direct = doneTodayCountByActivityKey[activityKey] ?? 0;
  if (direct > 0) return direct;

  if (parentItem.itemType !== "lfk_complex") return 0;

  const lines = listLfkSnapshotExerciseLines(parentItem.snapshot as Record<string, unknown>);
  const id = parentItem.id;

  if (lines.length === 0) {
    return doneTodayCountByItemId[id] ?? doneTodayCountByActivityKey[id] ?? 0;
  }

  const siblingsSum = lines.reduce(
    (acc, l) =>
      acc + (doneTodayCountByActivityKey[programActionDoneActivityKey(id, { exerciseId: l.exerciseId })] ?? 0),
    0,
  );
  const itemTotal = doneTodayCountByItemId[id] ?? 0;
  const slack = itemTotal - siblingsSum;
  if (slack <= 0) return 0;

  const zeroLines = lines.filter(
    (l) =>
      (doneTodayCountByActivityKey[programActionDoneActivityKey(id, { exerciseId: l.exerciseId })] ?? 0) === 0,
  );
  if (zeroLines.length === 0) return 0;

  const idxInZero = zeroLines.findIndex(
    (l) => programActionDoneActivityKey(id, { exerciseId: l.exerciseId }) === activityKey,
  );
  if (idxInZero < 0) return 0;

  const z = zeroLines.length;
  const base = Math.floor(slack / z);
  const rem = slack % z;
  return base + (idxInZero < rem ? 1 : 0);
}

function PatientCompositionItemProgressAside(props: {
  parentItem: InstanceStageRow["items"][number];
  activityKey: string;
  appDisplayTimeZone: string;
  doneTodayCountByActivityKey: Readonly<Record<string, number>>;
  lastDoneAtIsoByActivityKey: Readonly<Record<string, string>>;
  doneTodayCountByItemId: Readonly<Record<string, number>>;
}) {
  const {
    parentItem,
    activityKey,
    appDisplayTimeZone,
    doneTodayCountByActivityKey,
    lastDoneAtIsoByActivityKey,
    doneTodayCountByItemId,
  } = props;
  const completedAtForMerge = activityKey === parentItem.id ? parentItem.completedAt : null;
  const isoFromLog = lastDoneAtIsoByActivityKey[activityKey];
  const lastIso = mergeLastActivityDisplayedIso(isoFromLog, completedAtForMerge);
  const todayCount = compositionModalTodayDoneCount({
    parentItem,
    activityKey,
    doneTodayCountByActivityKey,
    doneTodayCountByItemId,
  });
  const dotCount = Math.min(todayCount, MAX_COMPOSITION_TODAY_DOTS);
  const dotOverflow = todayCount > MAX_COMPOSITION_TODAY_DOTS ? todayCount - MAX_COMPOSITION_TODAY_DOTS : 0;
  const relativeWhenDone = lastIso
    ? formatRelativePatientCalendarDayRu(lastIso, appDisplayTimeZone)
    : null;
  /** «Сегодня» в этой строке не дублируем — ниже уже «Сегодня:» и отметки. */
  const doneSummaryLine =
    relativeWhenDone == null
      ? "Пока без отметок"
      : relativeWhenDone === "Сегодня"
        ? "Выполнено"
        : `Выполнено ${relativeWhenDone}`;

  return (
    <div className="flex max-w-[11rem] shrink-0 flex-col items-end justify-center gap-0.5 text-right">
      <span className="w-full text-[10px] font-normal leading-tight text-muted-foreground">{doneSummaryLine}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-normal leading-tight text-muted-foreground">Сегодня:</span>
        <div
          className="flex min-h-[10px] flex-wrap items-center justify-end gap-0.5"
          aria-label={todayCount === 0 ? "Сегодня не отмечено" : `Сегодня отмечено ${todayCount} раз`}
        >
          {todayCount === 0 ? (
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/35" aria-hidden />
          ) : (
            <>
              {Array.from({ length: dotCount }, (_, i) => (
                <span
                  key={i}
                  className="size-2 shrink-0 rounded-full bg-[#16a34a]"
                  aria-hidden
                />
              ))}
              {dotOverflow > 0 ? (
                <span className="text-[10px] font-medium leading-none text-muted-foreground" aria-hidden>
                  +{dotOverflow}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ruDaysWordN(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function buildProgressTabProgramDaysLabel(
  detail: TreatmentProgramInstanceDetail,
  patientCalendarDayIana: string,
  appDisplayTimeZone: string,
): string {
  const n = resolvePatientProgramProgressDaysForPatientUi(
    detail,
    DateTime.now(),
    patientCalendarDayIana,
    appDisplayTimeZone,
  );
  if (n == null) return "—";
  return `${n} ${ruDaysWordN(n)}`;
}

function ruPassedStagesWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "этапов";
  const mod10 = n % 10;
  if (mod10 === 1) return "этап";
  if (mod10 >= 2 && mod10 <= 4) return "этапа";
  return "этапов";
}

function buildProgramHistoryNarrative(detail: TreatmentProgramInstanceDetail, tz: string): string[] {
  const lines: string[] = [];
  lines.push(`Назначена — ${formatBookingDateLongRu(detail.createdAt, tz)}`);
  const pipelineStages = detail.stages.filter((s) => s.sortOrder > 0);
  const startedInstants = pipelineStages
    .map((s) => s.startedAt)
    .filter((x): x is string => x != null && String(x).trim() !== "");
  const minStarted =
    startedInstants.length === 0 ? null : startedInstants.reduce((a, b) => (a < b ? a : b));
  if (minStarted) {
    lines.push(`Старт выполнения — ${formatBookingDateLongRu(minStarted, tz)}`);
  } else {
    lines.push("Старт выполнения — пока не было");
  }
  const stagesByStart = [...pipelineStages]
    .filter((s) => s.startedAt != null && String(s.startedAt).trim() !== "")
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const s of stagesByStart) {
    lines.push(`Открыт этап ${s.sortOrder} — ${formatBookingDateLongRu(String(s.startedAt), tz)}`);
  }
  if (detail.status === "completed") {
    lines.push(`Завершена — ${formatBookingDateLongRu(detail.updatedAt, tz)}`);
  }
  return lines;
}

function PatientProgramHeroHistoryPopover(props: {
  detail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  programEvents: TreatmentProgramEventRow[];
}) {
  const { detail, appDisplayTimeZone, programEvents } = props;
  const narrative = useMemo(
    () => buildProgramHistoryNarrative(detail, appDisplayTimeZone),
    [detail, appDisplayTimeZone],
  );
  /** Сырые `status_changed` дают пачку одинаковых строк; статус уже отражён в «Важные даты». */
  const eventsForPatient = useMemo(
    () => programEvents.filter((e) => e.eventType !== "status_changed"),
    [programEvents],
  );
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-20 lg:right-3 lg:top-3">
      <Popover>
        <PopoverTrigger
          type="button"
          className={cn(
            "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[var(--patient-color-primary)] outline-none transition-opacity touch-manipulation",
            "hover:opacity-80 active:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-2",
          )}
          aria-label="История программы"
        >
          <Info className="size-[17px] shrink-0 stroke-[2.25]" aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="w-[min(calc(100vw-1.5rem),18.5rem)] max-h-[min(70vh,24rem)] overflow-y-auto p-3 text-[11px] leading-snug text-foreground"
        >
          <p className="m-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Важные даты</p>
          <ul className="mt-2 max-w-full list-none space-y-1.5 p-0 [word-break:break-word]">
            {narrative.map((line, i) => (
              <li key={i} className="text-[11px] leading-snug text-foreground">
                {line}
              </li>
            ))}
          </ul>
          {eventsForPatient.length > 0 ? (
            <>
              <hr className="my-2.5 border-border/60" />
              <p className="m-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">События</p>
              <ul className="mt-2 max-w-full list-none space-y-1 p-0 [word-break:break-word]">
                {eventsForPatient.map((e) => (
                  <li key={e.id} className="text-[10px] leading-snug text-muted-foreground">
                    {formatBookingDateTimeShortStyleRu(e.createdAt, appDisplayTimeZone)} —{" "}
                    {formatTreatmentProgramEventTypeRu(e.eventType)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Строки модалки «Состав этапа»: ЛФК и набор тестов — отдельные исполнимые единицы; ключ активности для отметок в журнале. */
type CompositionModalEmptyMediaIcon = "exercise" | "recommendation";

type CompositionModalRow = {
  key: string;
  activityKey: string;
  text: string;
  thumbMedia: RecommendationMediaItem | null;
  /** Иконка в слоте превью, если в снимке нет выбранного медиа (при наличии медиа — только {@link PatientCatalogMediaStaticThumb}). */
  emptyMediaSlotKind: CompositionModalEmptyMediaIcon | null;
};

function compositionModalRowShowsMediaColumn(row: CompositionModalRow): boolean {
  return row.thumbMedia != null || row.emptyMediaSlotKind != null;
}

function compositionModalRowsForStageItem(item: InstanceStageRow["items"][number]): CompositionModalRow[] {
  const isExerciseOrRec = item.itemType === "recommendation" || item.itemType === "exercise";
  const thumbMedia = isExerciseOrRec
    ? pickRecommendationRowPreviewMedia(parseSnapshotMediaForRowThumb(item.snapshot))
    : null;
  const emptyMediaSlotKind: CompositionModalRow["emptyMediaSlotKind"] = isExerciseOrRec
    ? item.itemType === "exercise"
      ? "exercise"
      : "recommendation"
    : null;

  if (item.itemType === "lfk_complex") {
    const lines = listLfkSnapshotExerciseLines(item.snapshot as Record<string, unknown>);
    if (lines.length === 0) {
      const t = snapshotTitle(item.snapshot, item.itemType);
      return t.trim() !== ""
        ? [{ key: item.id, activityKey: item.id, text: t, thumbMedia: null, emptyMediaSlotKind: null }]
        : [];
    }
    return lines.map((line) => {
      const thumbMedia =
        line.media != null && Array.isArray(line.media)
          ? pickRecommendationRowPreviewMedia(
              parseSnapshotMediaForRowThumb({ media: line.media } as Record<string, unknown>),
            )
          : null;
      const rowKey = programActionDoneActivityKey(item.id, { exerciseId: line.exerciseId });
      return {
        key: rowKey,
        activityKey: rowKey,
        text: line.title,
        thumbMedia,
        emptyMediaSlotKind: "exercise" as const,
      };
    });
  }

  return [
    {
      key: item.id,
      activityKey: item.id,
      text: snapshotTitle(item.snapshot, item.itemType),
      thumbMedia,
      emptyMediaSlotKind,
    },
  ];
}

const compositionModalMediaSlotClass =
  "w-10 min-h-10 shrink-0 self-stretch rounded border border-border/40 bg-muted/30";

function PatientCompositionModalMediaLeading(props: {
  thumbMedia: RecommendationMediaItem | null;
  emptyMediaSlotKind: CompositionModalRow["emptyMediaSlotKind"];
}) {
  const { thumbMedia, emptyMediaSlotKind } = props;
  if (thumbMedia) {
    return (
      <PatientCatalogMediaStaticThumb
        media={thumbMedia}
        frameClassName={compositionModalMediaSlotClass}
        sizes="40px"
        iconClassName="size-4"
      />
    );
  }
  if (emptyMediaSlotKind === "exercise") {
    return (
      <div className={cn(compositionModalMediaSlotClass, "flex items-center justify-center")} aria-hidden>
        <Dumbbell className="size-4 text-muted-foreground" strokeWidth={2} />
      </div>
    );
  }
  if (emptyMediaSlotKind === "recommendation") {
    return (
      <div className={cn(compositionModalMediaSlotClass, "flex items-center justify-center")} aria-hidden>
        <ScrollText className="size-4 text-muted-foreground" strokeWidth={2} />
      </div>
    );
  }
  return null;
}

/** Модалка в portal: тема shadcn; строки пункта — тёмно-серый текст #444. */
const stageCompositionModalRowClass =
  "rounded-md border border-border/60 bg-card text-xs font-normal leading-snug";

function PatientProgramStagesTimeline(props: {
  stages: InstanceStageRow[];
  currentWorkingStage: InstanceStageRow | null;
  stageCountNonZero: number;
  detail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  doneTodayCountByActivityKey: Readonly<Record<string, number>>;
  lastDoneAtIsoByActivityKey: Readonly<Record<string, string>>;
  doneTodayCountByItemId: Readonly<Record<string, number>>;
}) {
  const {
    stages,
    currentWorkingStage,
    stageCountNonZero,
    detail,
    appDisplayTimeZone,
    doneTodayCountByActivityKey,
    lastDoneAtIsoByActivityKey,
    doneTodayCountByItemId,
  } = props;
  const [itemsModalStage, setItemsModalStage] = useState<InstanceStageRow | null>(null);
  const stageForModal = useMemo(() => {
    if (!itemsModalStage) return null;
    return detail.stages.find((s) => s.id === itemsModalStage.id) ?? itemsModalStage;
  }, [itemsModalStage, detail.stages]);

  return (
    <>
      <section
        id="patient-program-current-stage"
        className={patientCardListSectionClass}
        aria-labelledby="patient-program-stages-heading"
      >
        <PatientProgramBlockHeading
          id="patient-program-stages-heading"
          title="Этапы программы"
          Icon={List}
          iconClassName="text-[var(--patient-color-primary)]"
        />
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {stages.map((stage) => {
            const isActive = currentWorkingStage?.id === stage.id;
            const isPast = stage.status === "completed" || stage.status === "skipped";
            const isFuture = !isActive && !isPast && stage.status === "locked";
            const isStale =
              !isActive && !isPast && (stage.status === "available" || stage.status === "in_progress");

            let rowClass = patientTreatmentProgramListItemClass;
            let leftIcon: ReactNode;
            if (isActive) {
              rowClass = cn(
                patientTreatmentProgramListItemClass,
                "border-l-4 border-l-[var(--patient-color-primary)] bg-[var(--patient-color-primary-soft)]",
              );
              leftIcon = (
                <Play
                  className="size-4 shrink-0 fill-none text-[var(--patient-color-primary)]"
                  strokeWidth={2.5}
                  aria-hidden
                />
              );
            } else if (isPast) {
              rowClass = cn(patientTreatmentProgramListItemClass, "bg-muted/20 opacity-70");
              leftIcon =
                stage.status === "skipped" ? (
                  <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-[var(--patient-color-success)]"
                    aria-hidden
                  />
                );
            } else {
              rowClass = patientTreatmentProgramListItemClass;
              leftIcon = (
                <Lock className="mt-0.5 size-4 shrink-0 text-[var(--patient-color-primary)]/45" aria-hidden />
              );
            }

            const titleClass = isActive
              ? "text-sm font-bold text-[var(--patient-color-primary)]"
              : isPast
                ? "text-sm font-medium text-foreground"
                : isFuture
                  ? "text-sm font-medium text-[var(--patient-color-primary)]/58"
                  : "text-sm font-medium text-[var(--patient-color-primary)]/52";

            const titleBlock = (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {isActive ? (
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-wide text-[var(--patient-color-primary)]/75">
                    Активный этап
                  </span>
                ) : null}
                <span className={titleClass}>{stage.title}</span>
              </div>
            );

            const rowInnerStatic = (
              <div
                className={cn(
                  "flex w-full items-center gap-3",
                  (isFuture || isStale) && "pointer-events-none cursor-default",
                )}
              >
                <div
                  className={cn(
                    "flex min-w-0 flex-1 gap-3",
                    isActive ? "items-center" : "items-start",
                  )}
                >
                  {leftIcon}
                  {titleBlock}
                </div>
                {isActive ? (
                  <span
                    className={cn(
                      patientBadgePrimaryClass,
                      "h-6 max-w-full shrink-0 truncate border border-[var(--patient-color-primary)]/18 bg-[color-mix(in_srgb,var(--patient-card-bg)_92%,var(--patient-color-primary-soft)_8%)] px-2 text-[10px]",
                    )}
                  >
                    {stage.sortOrder} из {stageCountNonZero}
                  </span>
                ) : null}
              </div>
            );

            const openComposition = isActive || isPast;

            return (
              <li key={stage.id}>
                {openComposition ? (
                  <button
                    type="button"
                    className={cn(
                      rowClass,
                      "w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-2",
                      isActive
                        ? "transition-[filter] hover:brightness-[0.985]"
                        : "transition-colors hover:bg-[var(--patient-color-primary-soft)]/25",
                    )}
                    aria-label={`Состав этапа: ${stage.title}`}
                    onClick={() => setItemsModalStage(stage)}
                  >
                    {rowInnerStatic}
                  </button>
                ) : (
                  <div className={rowClass}>{rowInnerStatic}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={itemsModalStage !== null} onOpenChange={(open) => !open && setItemsModalStage(null)}>
        <PatientModalDialogContent title={stageForModal?.title ?? ""}>
          {stageForModal ? (
            <>
              {(() => {
                  const visibleItems = sortByOrderThenId(
                    stageForModal.items.filter((it) =>
                      isInstanceStageItemShownInPatientCompositionModal(it, stageForModal.groups),
                    ),
                  );
                  if (visibleItems.length === 0) {
                    return <p className="text-sm font-normal text-muted-foreground">Нет элементов для отображения.</p>;
                  }
                  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stageForModal.groups).filter((g) =>
                    visibleItems.some((it) => it.groupId === g.id),
                  );
                  const ungroupedItems = sortByOrderThenId(
                    visibleItems.filter((it) => !it.groupId),
                  );

                  const renderCompositionItem = (it: (typeof visibleItems)[number]) => {
                    const rows = compositionModalRowsForStageItem(it);
                    return rows.map((row) => {
                      const showMediaCol = compositionModalRowShowsMediaColumn(row);
                      return (
                      <li
                        key={row.key}
                        className={cn(
                          stageCompositionModalRowClass,
                          "flex items-stretch gap-1.5 px-1.5 py-1.5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex min-w-0 flex-1 basis-0 gap-1.5",
                            showMediaCol ? "items-stretch" : "items-start",
                          )}
                        >
                          <PatientCompositionModalMediaLeading
                            thumbMedia={row.thumbMedia}
                            emptyMediaSlotKind={row.emptyMediaSlotKind}
                          />
                          <span
                            className={cn(
                              "min-w-0 break-words text-[#444444]",
                              showMediaCol ? "flex-1 py-0" : "block flex-1",
                            )}
                          >
                            {row.text}
                          </span>
                        </div>
                        <PatientCompositionItemProgressAside
                          parentItem={it}
                          activityKey={row.activityKey}
                          appDisplayTimeZone={appDisplayTimeZone}
                          doneTodayCountByActivityKey={doneTodayCountByActivityKey}
                          lastDoneAtIsoByActivityKey={lastDoneAtIsoByActivityKey}
                          doneTodayCountByItemId={doneTodayCountByItemId}
                        />
                      </li>
                    );
                    });
                  };

                  return (
                    <>
                      {ungroupedItems.length > 0 ? (
                        <ul
                          className={cn(
                            "m-0 list-none space-y-1 p-0",
                            sortedGroups.length > 0 && "mb-2",
                          )}
                        >
                          {ungroupedItems.flatMap(renderCompositionItem)}
                        </ul>
                      ) : null}
                      {sortedGroups.map((g) => {
                        const gItems = sortByOrderThenId(
                          visibleItems.filter((it) => it.groupId === g.id),
                        );
                        if (gItems.length === 0) return null;
                        return (
                          <section key={g.id} className="space-y-1">
                            <div>
                              <span className="text-sm font-medium text-[#284da0]">{g.title}</span>
                              {g.scheduleText?.trim() ? (
                                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                  {g.scheduleText.trim()}
                                </span>
                              ) : null}
                            </div>
                            <ul className="m-0 list-none space-y-1 p-0">{gItems.flatMap(renderCompositionItem)}</ul>
                          </section>
                        );
                      })}
                    </>
                  );
                })()}
            </>
          ) : null}
        </PatientModalDialogContent>
      </Dialog>
    </>
  );
}

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

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function usePostMarkItemViewedWhenVisible(opts: {
  instanceId: string;
  itemId: string;
  enabled: boolean;
  onDone: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { instanceId, itemId, enabled, onDone } = opts;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    let done = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (done) return;
        const e = entries[0];
        if (!e?.isIntersecting || e.intersectionRatio < 0.35) return;
        done = true;
        void fetch(
          `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/mark-viewed`,
          { method: "POST" },
        )
          .then(() => onDone())
          .catch(() => {});
        obs.disconnect();
      },
      { threshold: [0, 0.35, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, instanceId, itemId, onDone]);
  return ref;
}

function PatientInstanceStageItemCard(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  groupTitle: string | null;
  item: TreatmentProgramInstanceDetail["stages"][number]["items"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  contentBlocked: boolean;
  /** Только просмотр: без отметок, чек-листов и полей ввода. */
  itemInteraction: "full" | "readOnly";
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  /** Сколько строк `done` за сегодня по этому элементу (GET checklist-today). */
  todayChecklistDoneCount?: number;
  /** Нейтральный фон карточки (белый) на тонированной панели — блок рекомендаций на detail. */
  neutralItemChrome?: boolean;
  onOpenModal: () => void;
}) {
  const {
    instanceId,
    stage,
    groupTitle,
    item,
    base,
    busy,
    setBusy,
    setError,
    refresh,
    contentBlocked,
    itemInteraction,
    doneItemIds,
    onDoneItemIds,
    todayChecklistDoneCount,
    neutralItemChrome = false,
    onOpenModal,
  } = props;
  const readOnly = itemInteraction === "readOnly";
  const [markingViewed, setMarkingViewed] = useState(false);
  const showsNew =
    !readOnly && patientStageItemShowsNewBadge(item, contentBlocked);
  const lfkRow = useMemo(
    (): PatientProgramChecklistRow => ({
      stageId: stage.id,
      stageTitle: stage.title,
      stageSortOrder: stage.sortOrder,
      groupId: item.groupId,
      groupTitle,
      item,
    }),
    [stage.id, stage.title, stage.sortOrder, item, groupTitle],
  );
  const recommendationPreviewMedia = useMemo(() => {
    if (item.itemType !== "recommendation") return null;
    return pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(item.snapshot));
  }, [item.itemType, item.snapshot]);
  const recommendationBodyPreview = useMemo(() => {
    if (item.itemType !== "recommendation") return "";
    return recommendationBodyMdPreviewPlain(item.snapshot.bodyMd);
  }, [item.itemType, item.snapshot]);
  const markRef = usePostMarkItemViewedWhenVisible({
    instanceId,
    itemId: item.id,
    enabled: showsNew,
    onDone: () => {
      void refresh();
    },
  });
  const openModalButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "shrink-0",
        item.itemType === "recommendation" ? "h-8 px-2.5 text-xs" : "h-8",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpenModal();
      }}
    >
      Открыть
    </Button>
  );

  return (
    <li
      ref={markRef}
      className={cn(
        patientTreatmentProgramListItemClass,
        "cursor-pointer border-[var(--patient-border)]/80 transition-[filter] hover:brightness-[0.97] active:brightness-[0.95]",
        neutralItemChrome
          ? "bg-[var(--patient-card-bg)]"
          : "bg-[var(--patient-color-primary-soft)]/10",
        item.itemType === "recommendation" &&
          cn("flex h-14 items-center gap-2 overflow-hidden py-0 pl-0 pr-2 lg:gap-2.5 lg:pr-2.5"),
      )}
      onClick={onOpenModal}
    >
      {item.itemType === "recommendation" ? (
        <PatientCatalogMediaStaticThumb
          media={recommendationPreviewMedia}
          frameClassName="size-14 shrink-0 rounded-l-lg rounded-r-none border-y border-r border-[var(--patient-border)]/70"
          sizes="56px"
        />
      ) : null}
      <div
        className={cn(
          item.itemType === "recommendation" &&
            "flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden py-0 pr-0",
        )}
      >
      <p
        className={cn(
          "text-sm font-medium",
          item.itemType === "recommendation"
            ? "flex min-w-0 items-center gap-2 leading-tight"
            : "flex flex-wrap items-center gap-2",
        )}
      >
        <span className={cn(item.itemType === "recommendation" && "min-w-0 truncate")}>
          {snapshotTitle(item.snapshot, item.itemType)}
        </span>
        {showsNew ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className={patientPillClass}>Новое</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              disabled={markingViewed}
              onClick={async (e) => {
                e.stopPropagation();
                setMarkingViewed(true);
                setError(null);
                try {
                  const res = await fetch(
                    `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(item.id)}/mark-viewed`,
                    { method: "POST" },
                  );
                  if (res.ok) void refresh();
                } finally {
                  setMarkingViewed(false);
                }
              }}
            >
              Снять «Новое»
            </Button>
          </span>
        ) : null}
        {item.itemType !== "recommendation" ? (
          <span className={cn(patientMutedTextClass, "font-normal")}>({item.itemType})</span>
        ) : null}
      </p>
      {item.itemType !== "recommendation" ? (
        <div className="mt-1 flex justify-end">{openModalButton}</div>
      ) : null}
      {item.itemType === "recommendation" && recommendationBodyPreview ? (
        <p
          className={cn(
            patientMutedTextClass,
            "line-clamp-1 min-w-0 text-xs leading-tight",
          )}
        >
          {recommendationBodyPreview}
        </p>
      ) : null}
      {effectiveInstanceStageItemComment(item) && item.itemType !== "recommendation" ? (
        <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
          Комментарий:{" "}
          <span className="text-foreground">{effectiveInstanceStageItemComment(item)}</span>
        </p>
      ) : null}
      {item.itemType !== "recommendation" ? (
        <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
          Элемент:{" "}
          {item.completedAt ? (
            <span className="text-emerald-600 dark:text-emerald-400">выполнен</span>
          ) : (
            <span>не выполнен</span>
          )}
        </p>
      ) : null}
      {!readOnly &&
      todayChecklistDoneCount != null &&
      todayChecklistDoneCount > 0 &&
      item.itemType !== "recommendation" ? (
        <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px] leading-snug")}>
          Отметок в журнале за сегодня:{" "}
          <span className="font-medium text-foreground">{todayChecklistDoneCount}</span>
        </p>
      ) : null}

      {!contentBlocked && !readOnly ? (
        item.itemType === "test_set" ? (
          <div className="mt-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <TestSetBlock
              itemId={item.id}
              snapshot={item.snapshot}
              completed={Boolean(item.completedAt)}
              baseUrl={base}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onDone={refresh}
            />
          </div>
        ) : item.itemType === "lfk_complex" && !isPersistentRecommendation(item) ? (
          <div
            className="mt-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <PatientLfkChecklistRow
              row={lfkRow}
              itemBaseUrl={base}
              done={doneItemIds.includes(item.id)}
              onUpdated={onDoneItemIds}
              onAfterSave={refresh}
              setError={setError}
            />
          </div>
        ) : !isPersistentRecommendation(item) ? (
          <div className="mt-2">
            <button
              type="button"
              className={cn(patientCompactActionClass, "h-9 w-auto text-sm")}
              disabled={busy !== null}
              onClick={async (e) => {
                e.stopPropagation();
                setBusy(item.id);
                setError(null);
                try {
                  const res = await fetch(`${base}/${encodeURIComponent(item.id)}/progress/complete`, {
                    method: "POST",
                  });
                  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                  if (!res.ok || !data.ok) {
                    setError(data.error ?? "Ошибка");
                    return;
                  }
                  await refresh();
                } finally {
                  setBusy(null);
                }
              }}
            >
              {item.completedAt ? "Отметить ещё раз" : "Отметить выполненным"}
            </button>
          </div>
        ) : null
      ) : null}
      {!contentBlocked && readOnly && item.itemType === "test_set" ? (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {item.completedAt ? "Набор тестов пройден." : "Набор тестов не выполнялся."}
        </p>
      ) : null}
      </div>
      {item.itemType === "recommendation" ? openModalButton : null}
    </li>
  );
}

export function PatientInstanceStageBody(props: {
  instanceId: string;
  stage: TreatmentProgramInstanceDetail["stages"][number];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  /** Этап 0: контент элементов доступен независимо от статуса «заблокирован» этапа. */
  ignoreStageLockForContent: boolean;
  surfaceClass: string;
  heading: ReactNode;
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  /** Агрегат `doneTodayCountByItemId` из checklist-today для строк этапа. */
  todayCountByStageItemId?: Readonly<Record<string, number>>;
  /**
   * Вертикальный ритм как у блока «Этапы программы» (рекомендации в коллапсе на detail).
   */
  stackVariant?: "default" | "likeStagesTimeline";
  /** Архив этапа: только список без действий. */
  itemInteraction?: "full" | "readOnly";
  /** Не показывать «Описание этапа» и текст описания этапа (этап 0 / рекомендации). */
  hideStageDescription?: boolean;
}) {
  const {
    instanceId,
    stage,
    base,
    busy,
    setBusy,
    setError,
    refresh,
    ignoreStageLockForContent,
    surfaceClass,
    heading,
    doneItemIds,
    onDoneItemIds,
    todayCountByStageItemId,
    stackVariant = "default",
    itemInteraction = "full",
    hideStageDescription = false,
  } = props;
  const likeStages = stackVariant === "likeStagesTimeline";
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  const visibleItems = stage.items.filter((it) =>
    itemInteraction === "readOnly"
      ? isInstanceStageItemActiveForPatient(it)
      : isInstanceStageItemShownOnPatientProgramSurfaces(it),
  );
  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups).filter((g) => {
    if (!isTreatmentProgramInstanceSystemStageGroup(g)) {
      return visibleItems.some((it) => it.groupId === g.id);
    }
    return patientInstanceSystemGroupHasVisibleItems({ group: g, items: visibleItems });
  });
  const ungroupedItems = sortByOrderThenId(visibleItems.filter((it) => !it.groupId));

  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const flatOrderedIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of sortedGroups) {
      const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
      for (const it of gItems) ids.push(it.id);
    }
    for (const it of ungroupedItems) ids.push(it.id);
    return ids;
  }, [sortedGroups, visibleItems, ungroupedItems]);

  const openModalItem = useMemo(
    () => (openItemId ? (visibleItems.find((it) => it.id === openItemId) ?? null) : null),
    [openItemId, visibleItems],
  );

  return (
    <section className={surfaceClass}>
      {heading != null ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-2">{heading}</div>
      ) : null}
      <PatientStageHeaderFields
        stage={stage}
        compactSpacing={likeStages}
        hideDescription={hideStageDescription}
      />
      {contentBlocked ? (
        <p className={patientMutedTextClass}>Этап откроется после завершения предыдущего или по решению врача.</p>
      ) : null}
      <div className={cn("m-0 p-0", likeStages ? "space-y-1.5" : "space-y-3")}>
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
          return (
            <details
              key={g.id}
              className={cn(
                patientTreatmentProgramListItemClass,
                "border-[var(--patient-border)]/80",
                likeStages ? "bg-[var(--patient-card-bg)]" : "bg-[var(--patient-color-primary-soft)]/5",
              )}
              open
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-foreground">{g.title}</span>
                {g.scheduleText?.trim() ? (
                  <span className={cn(patientMutedTextClass, "mt-1 block text-xs")}>
                    {g.scheduleText.trim()}
                  </span>
                ) : null}
              </summary>
              {g.description?.trim() ? (
                <p className={cn(patientBodyTextClass, "mt-2 whitespace-pre-wrap text-sm")}>{g.description.trim()}</p>
              ) : null}
              <ul className={cn("m-0 list-none p-0", likeStages ? "mt-1.5 space-y-1.5" : "mt-2 space-y-3")}>
                {gItems.map((item) => (
                  <PatientInstanceStageItemCard
                    key={item.id}
                    instanceId={instanceId}
                    stage={stage}
                    groupTitle={g.title}
                    item={item}
                    base={base}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                    refresh={refresh}
                    contentBlocked={contentBlocked}
                    itemInteraction={itemInteraction}
                    doneItemIds={doneItemIds}
                    onDoneItemIds={onDoneItemIds}
                    todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                    neutralItemChrome={likeStages}
                    onOpenModal={() => setOpenItemId(item.id)}
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {ungroupedItems.length > 0 ? (
          <div className={likeStages ? "space-y-1.5" : "space-y-3"}>
            {sortedGroups.length > 0 ? (
              <h3 className={cn(patientSectionTitleClass, "text-sm")}>Без группы</h3>
            ) : null}
            <ul className={cn("m-0 list-none p-0", likeStages ? "space-y-1.5" : "space-y-3")}>
              {ungroupedItems.map((item) => (
                <PatientInstanceStageItemCard
                  key={item.id}
                  instanceId={instanceId}
                  stage={stage}
                  groupTitle={null}
                  item={item}
                  base={base}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  refresh={refresh}
                  contentBlocked={contentBlocked}
                  itemInteraction={itemInteraction}
                  doneItemIds={doneItemIds}
                  onDoneItemIds={onDoneItemIds}
                  todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                  neutralItemChrome={likeStages}
                  onOpenModal={() => setOpenItemId(item.id)}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <PatientProgramStageItemModal
        stage={stage}
        base={base}
        item={openModalItem}
        flatOrderedIds={flatOrderedIds}
        onClose={() => setOpenItemId(null)}
        onNavigate={(id) => setOpenItemId(id)}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        refresh={refresh}
        itemInteraction={itemInteraction}
        doneItemIds={doneItemIds}
        onDoneItemIds={onDoneItemIds}
        contentBlocked={contentBlocked}
      />
    </section>
  );
}

function PatientLfkChecklistRow(props: {
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

function PatientProgramControlCard(props: {
  /** Дата контроля; если null — показывается {@link fallbackMessage}. */
  dateLine: string | null;
  /** Остаток календарных дней до контроля — строка «(через N дней)». */
  remainderDays: number | null;
  fallbackMessage: string;
  instanceId: string;
  currentStageId: string | null;
  /** Вместо перехода на страницу этапа — переключить вкладку «Программа». */
  onProgramTests?: () => void;
}) {
  const { dateLine, remainderDays, fallbackMessage, instanceId, currentStageId, onProgramTests } = props;
  return (
    <section className={patientSurfaceWarningClass} aria-label="Следующий контроль">
      <div className="flex min-w-0 flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarCheck
              className="size-4 shrink-0 text-[var(--patient-color-warning)]"
              aria-hidden
            />
            <h3 className={cn(patientSectionTitleClass, "mb-0 leading-tight")}>Следующий контроль</h3>
          </div>
          {dateLine ? (
            <p className="mt-0 text-sm font-semibold leading-snug text-foreground">
              <span>{dateLine}</span>
              {remainderDays != null ? (
                <span className="text-[11px] font-normal leading-snug text-neutral-700 dark:text-neutral-400">
                  {" "}
                  (через {remainderDays} {ruDaysWordN(remainderDays)})
                </span>
              ) : null}
            </p>
          ) : (
            <p className={cn(patientMutedTextClass, "mt-0 text-base font-semibold leading-snug")}>
              {fallbackMessage}
            </p>
          )}
          <p className={cn(patientMutedTextClass, "mt-0 text-xs leading-[1.15]")}>
            Консультация со специалистом
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {currentStageId ? (
            onProgramTests ? (
              <button
                type="button"
                onClick={onProgramTests}
                className={cn(
                  patientButtonWarningOutlineClass,
                  "w-auto min-h-8 shrink-0 px-2.5 py-1.5 text-xs font-semibold leading-tight sm:min-h-8",
                )}
              >
                Выполнить тесты
              </button>
            ) : null
          ) : null}
          <Link
            href={routePaths.cabinet}
            className={cn(
              patientButtonSuccessClass,
              "w-auto min-h-8 shrink-0 px-2.5 py-1.5 text-xs font-semibold leading-tight sm:min-h-8",
            )}
          >
            Запись на приём
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PatientTreatmentProgramDetailClient(props: {
  initial: TreatmentProgramInstanceDetail;
  initialTestResults: TreatmentProgramTestResultDetailRow[];
  initialProgramEvents?: TreatmentProgramEventRow[];
  appDisplayTimeZone: string;
  programDescription?: string | null;
  /** IANA для календарных суток пациента. */
  patientCalendarDayIana: string;
}) {
  const {
    appDisplayTimeZone,
    programDescription = null,
    initialProgramEvents = [],
    patientCalendarDayIana,
  } = props;
  const [activeTab, setActiveTab] = useState<"program" | "recommendations" | "progress">("program");
  const [heroModalItemId, setHeroModalItemId] = useState<string | null>(null);
  const [detail, setDetail] = useState(props.initial);

  useEffect(() => {
    void import("@/app/app/patient/treatment/PatientTreatmentTabProgram");
    void import("@/app/app/patient/treatment/PatientTreatmentTabRecommendations");
  }, []);
  const [testResults, setTestResults] = useState(props.initialTestResults);
  const [programEvents, setProgramEvents] = useState(initialProgramEvents);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByActivityKey, setDoneTodayCountByActivityKey] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByActivityKey, setLastDoneAtIsoByActivityKey] = useState<Record<string, string>>({});
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
      doneTodayCountByActivityKey?: unknown;
      lastDoneAtIsoByActivityKey?: unknown;
      lastDoneAtIsoByItemId?: unknown;
    };
    if (data.item.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByActivityKey({});
      setLastDoneAtIsoByActivityKey({});
      setDoneTodayCountByItemId({});
      setLastDoneAtIsoByItemId({});
    } else if (checklistRes.ok && chData?.ok === true && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
      setDoneTodayCountByActivityKey(normalizeChecklistCountMap(chData.doneTodayCountByActivityKey));
      setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(chData.lastDoneAtIsoByActivityKey));
      setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
      setLastDoneAtIsoByItemId(normalizeChecklistLastMap(chData.lastDoneAtIsoByItemId));
    }
    setStatsRefreshToken((t) => t + 1);
  }, [detail.id]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/items`;

  useEffect(() => {
    void (async () => {
      if (detail.status !== "active") {
        setDoneItemIds([]);
        setDoneTodayCountByActivityKey({});
        setLastDoneAtIsoByActivityKey({});
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
        doneTodayCountByActivityKey?: unknown;
        lastDoneAtIsoByActivityKey?: unknown;
        lastDoneAtIsoByItemId?: unknown;
      };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) {
        setDoneItemIds(data.doneItemIds);
        setDoneTodayCountByActivityKey(normalizeChecklistCountMap(data.doneTodayCountByActivityKey));
        setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(data.lastDoneAtIsoByActivityKey));
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

  const { stageZeroStages, currentWorkingStage, pipelineStages } = useMemo(() => {
    const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
    const cur = selectCurrentWorkingStageForPatientDetail(pipeline);
    return {
      stageZeroStages: stageZero.filter((s) => patientStageSectionShouldRender(s, true)),
      currentWorkingStage: cur,
      pipelineStages: pipeline,
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

  const firstPendingProgramItemId = useMemo(() => {
    if (!programTabStage || detail.status !== "active") return null;
    const ordered = flatOrderedProgramCompositionItemIds(programTabStage);
    const pending = ordered.find((id) => !doneItemIds.includes(id));
    return pending ?? ordered[0] ?? null;
  }, [programTabStage, doneItemIds, detail.status]);

  const openHeroLesson = useCallback(() => {
    if (!firstPendingProgramItemId) return;
    setHeroModalItemId(firstPendingProgramItemId);
  }, [firstPendingProgramItemId]);

  const recommendationListCount = useMemo(() => {
    let n = 0;
    if (currentWorkingStage) {
      n += currentWorkingStage.items.filter((it) => isPersistentRecommendation(it)).length;
    }
    for (const st of stageZeroStages) {
      n += st.items.filter((it) => isInstanceStageItemShownOnPatientProgramSurfaces(it)).length;
    }
    return n;
  }, [currentWorkingStage, stageZeroStages]);

  const programTabSubtitle = useMemo(() => {
    if (!programTabStage) return "—";
    if (programTabStage.sortOrder === 0) return "Общие рекомендации";
    return `Этап ${programTabStage.sortOrder} из ${pipelineLength}`;
  }, [programTabStage, pipelineLength]);

  const heroModalItem = useMemo(() => {
    if (!heroModalItemId || !programTabStage) return null;
    return programTabStage.items.find((it) => it.id === heroModalItemId) ?? null;
  }, [heroModalItemId, programTabStage]);

  const heroModalFlatIds = useMemo(
    () => (programTabStage ? flatOrderedProgramCompositionItemIds(programTabStage) : []),
    [programTabStage],
  );

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

  if (detail.status === "completed") {
    const passedStages = countPatientCompletedPipelineStages(detail.stages);
    return (
      <div className={patientInnerPageStackClass}>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div
          className={cn(
            patientHomeCardHeroClass,
            "relative isolate overflow-hidden rounded-b-none p-4 pt-3 lg:rounded-b-none lg:p-5",
          )}
        >
          <PatientProgramHeroHistoryPopover
            detail={detail}
            appDisplayTimeZone={appDisplayTimeZone}
            programEvents={programEvents}
          />
          <h2
            className={cn(
              patientLineClamp2Class,
              patientHeroTitleBaseClass,
              patientInnerHeroTitleTypographyClass,
              "mt-0.5 pr-11 lg:pr-12",
            )}
          >
            {detail.title}
          </h2>
          <p className={cn(patientBodyTextClass, "mt-3 text-sm leading-snug")}>Программа реабилитации завершена</p>
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>
            Дата завершения: {formatBookingDateLongRu(detail.updatedAt, appDisplayTimeZone)}
          </p>
          <p className={cn(patientMutedTextClass, "mt-1 text-sm")}>
            Пройдено {passedStages} {ruPassedStagesWord(passedStages)}
          </p>
        </div>
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
        {/* C1: Hero — компактный заголовок; история по (i) */}
        <div
          className={cn(
            patientHomeCardHeroClass,
            "relative isolate overflow-hidden rounded-b-none p-4 pt-3 lg:rounded-b-none lg:p-5",
          )}
        >
          <PatientProgramHeroHistoryPopover
            detail={detail}
            appDisplayTimeZone={appDisplayTimeZone}
            programEvents={programEvents}
          />
          <h2
            className={cn(
              patientLineClamp2Class,
              patientHeroTitleBaseClass,
              patientInnerHeroTitleTypographyClass,
              "mt-0.5 pr-11 lg:pr-12",
            )}
          >
            {detail.title}
          </h2>
          {programDescription?.trim() ? (
            <p className={cn(patientMutedTextClass, "mt-2 line-clamp-3 text-sm leading-snug")}>
              {programDescription.trim()}
            </p>
          ) : null}
          {awaitsStart ? (
            <p className="mt-2" role="status">
              <span className={patientBadgeDangerClass}>Ожидает старта</span>
            </p>
          ) : null}
          {programTabStage && firstPendingProgramItemId ? (
            <button
              type="button"
              onClick={openHeroLesson}
              className={cn(
                patientHeroPrimaryActionClass,
                "mt-5 mb-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm shadow-[0_6px_14px_rgba(40,77,160,0.24)] lg:mt-6 lg:mb-4 lg:min-h-12 lg:text-base",
              )}
            >
              <PlayCircle className="size-5 shrink-0 lg:size-6" aria-hidden />
              Начать занятие
            </button>
          ) : programTabStage ? null : (
            <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>Нет открытых этапов.</p>
          )}
        </div>

        <div
          className="sticky top-0 z-[5] grid grid-cols-3 gap-px border-x border-b border-[var(--patient-border)] bg-[var(--patient-border)] shadow-sm"
          role="tablist"
          aria-label="Разделы программы"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "program"}
            className={cn(
              "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
              activeTab === "program" &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
              activeTab === "program" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
              "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
            )}
            onClick={() => setActiveTab("program")}
          >
            <span
              className={cn(
                "text-xs font-semibold lg:text-sm",
                activeTab === "program" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
              )}
            >
              Программа
            </span>
            <span
              className={cn(
                "text-[10px] leading-tight lg:text-xs",
                activeTab === "program" ? "text-[#1e3a5f]" : "text-[#555555]",
              )}
            >
              {programTabSubtitle}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "recommendations"}
            className={cn(
              "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
              activeTab === "recommendations" &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
              activeTab === "recommendations" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
              "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
            )}
            onClick={() => setActiveTab("recommendations")}
          >
            <span
              className={cn(
                "text-xs font-semibold lg:text-sm",
                activeTab === "recommendations" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
              )}
            >
              Рекомендации
            </span>
            <span
              className={cn(
                "text-[10px] leading-tight lg:text-xs",
                activeTab === "recommendations" ? "text-[#1e3a5f]" : "text-[#555555]",
              )}
            >
              {recommendationListCount} рекомендаций
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "progress"}
            className={cn(
              "relative flex min-h-[3.25rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-200 lg:min-h-[3.5rem] lg:px-2",
              activeTab === "progress" &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[1] after:h-0.5 after:bg-[var(--patient-color-primary,#284da0)]",
              activeTab === "progress" ? "bg-[#e4e2ff]" : "bg-[#f8f3fd]",
              "focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-0",
            )}
            onClick={() => setActiveTab("progress")}
          >
            <span
              className={cn(
                "text-xs font-semibold lg:text-sm",
                activeTab === "progress" ? "text-[var(--patient-color-primary,#284da0)]" : "text-[#444444]",
              )}
            >
              Прогресс
            </span>
            <span
              className={cn(
                "text-[10px] leading-tight lg:text-xs",
                activeTab === "progress" ? "text-[#1e3a5f]" : "text-[#555555]",
              )}
            >
              {progressTabProgramDaysLabel}
            </span>
          </button>
        </div>
      </div>

      <div className={cn(activeTab !== "program" && "hidden")} role="tabpanel" aria-label="Программа">
        <Suspense fallback={<p className={patientMutedTextClass}>Загрузка…</p>}>
          <PatientTreatmentTabProgramLazy
            instanceId={detail.id}
            currentWorkingStage={programTabStage}
            pipelineLength={pipelineLength}
            allStages={detail.stages}
            appDisplayTimeZone={appDisplayTimeZone}
            embeddedChecklist={{
              doneItemIds,
              doneTodayCountByItemId,
              lastDoneAtIsoByItemId,
            }}
            onRefreshDetail={refresh}
          />
        </Suspense>
      </div>

      <div className={cn(activeTab !== "recommendations" && "hidden")} role="tabpanel" aria-label="Рекомендации">
        <Suspense fallback={<p className={patientMutedTextClass}>Загрузка…</p>}>
          <PatientTreatmentTabRecommendationsLazy
            currentWorkingStage={currentWorkingStage}
            stageZeroStages={stageZeroStages}
            base={base}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            refresh={refresh}
          />
        </Suspense>
      </div>

      <div className={cn(activeTab !== "progress" && "hidden")} role="tabpanel" aria-label="Прогресс">
        <div className={patientInnerPageStackClass}>
          {stagesTimeline.length > 0 ? (
            <div className="min-w-0">
              <PatientProgramStagesTimeline
                stages={stagesTimeline}
                currentWorkingStage={currentWorkingStage}
                stageCountNonZero={stageCountNonZero}
                detail={detail}
                appDisplayTimeZone={appDisplayTimeZone}
                doneTodayCountByActivityKey={doneTodayCountByActivityKey}
                lastDoneAtIsoByActivityKey={lastDoneAtIsoByActivityKey}
                doneTodayCountByItemId={doneTodayCountByItemId}
              />
            </div>
          ) : null}
          {showNextControlCard && currentWorkingStage ? (
            <PatientProgramControlCard
              dateLine={controlDateLine}
              remainderDays={controlRemainderDaysForCard}
              fallbackMessage={controlFallbackMessage}
              instanceId={detail.id}
              currentStageId={currentWorkingStage.id}
              onProgramTests={() => setActiveTab("program")}
            />
          ) : null}
          <PatientProgramPassageStatisticsSection
            instanceId={detail.id}
            detailCreatedAtIso={detail.createdAt}
            detailStatus={detail.status}
            patientCalendarDayIana={patientCalendarDayIana}
            refreshToken={statsRefreshToken}
          />
        </div>
      </div>

      {heroModalItemId && programTabStage ? (
        <PatientProgramStageItemModal
          stage={programTabStage}
          base={base}
          item={heroModalItem}
          flatOrderedIds={heroModalFlatIds}
          onClose={() => setHeroModalItemId(null)}
          onNavigate={(id) => setHeroModalItemId(id)}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          itemInteraction="full"
          doneItemIds={doneItemIds}
          onDoneItemIds={setDoneItemIds}
          contentBlocked={
            programTabStage.sortOrder > 0 &&
            (programTabStage.status === "locked" || programTabStage.status === "skipped")
          }
        />
      ) : null}

    </div>
  );
}

function TestSetBlock(props: {
  itemId: string;
  snapshot: Record<string, unknown>;
  completed: boolean;
  baseUrl: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  onDone: () => Promise<void>;
}) {
  const { itemId, snapshot, completed, baseUrl, busy, setBusy, setError, onDone } = props;
  const testIds = useMemo(() => testIdsFromTestSetSnapshot(snapshot), [snapshot]);
  const testsMeta = useMemo(() => parseTestSetSnapshotTests(snapshot), [snapshot]);

  const [scores, setScores] = useState<Record<string, string>>({});
  const [qualDecisions, setQualDecisions] = useState<Record<string, NormalizedTestDecision | "">>({});
  const [qualNotes, setQualNotes] = useState<Record<string, string>>({});

  const ensureAttempt = useCallback(async () => {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-attempt`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Не удалось начать попытку");
      return false;
    }
    return true;
  }, [baseUrl, itemId, setError]);

  if (completed) {
    return <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Набор тестов пройден.</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className={cn(patientMutedTextClass, "text-xs")}>
        Если у теста в программе заданы числовые пороги — введите балл (score), итог подставится автоматически. Для
        качественной оценки и прочих случаев без порогов выберите итог (зачтено / не зачтено / частично); при
        необходимости добавьте текст в поле комментария.
      </p>
      {testsMeta.length === 0 ? (
        <p className="text-xs text-destructive">В снимке нет списка тестов.</p>
      ) : (
        testsMeta.map((t) => {
          const autoFromScore = scoringAllowsNumericDecisionInference(t.scoringConfig);
          return (
            <div
              key={t.testId}
              className="flex flex-col gap-1 rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] px-2 py-1.5"
            >
              <span className="text-xs font-medium">{t.title ?? t.testId}</span>
              {t.comment ? (
                <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px]")}>
                  Комментарий к позиции: <span className="text-foreground">{t.comment}</span>
                </p>
              ) : null}
              {autoFromScore ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    className="h-8 max-w-[120px] text-sm"
                    placeholder="score"
                    value={scores[t.testId] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [t.testId]: e.target.value }))}
                    disabled={busy !== null}
                  />
                  <button
                    type="button"
                    className={cn(patientCompactActionClass, "h-8 w-auto text-sm")}
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(itemId + t.testId);
                      setError(null);
                      try {
                        if (!(await ensureAttempt())) return;
                        const raw = scores[t.testId]?.trim();
                        const num = raw === "" || raw === undefined ? NaN : Number(raw);
                        const body: Record<string, unknown> = {
                          testId: t.testId,
                          rawValue: Number.isFinite(num) ? { score: num } : { value: raw ?? "" },
                        };
                        if (!Number.isFinite(num)) {
                          body.normalizedDecision = "partial";
                        }
                        const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-result`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                        });
                        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                        if (!res.ok || !data.ok) {
                          setError(data.error ?? "Ошибка сохранения");
                          return;
                        }
                        await onDone();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className={cn(patientMutedTextClass, "text-[11px]")}>Итог</Label>
                    <Select
                      value={qualDecisions[t.testId] || undefined}
                      onValueChange={(v) =>
                        setQualDecisions((s) => ({ ...s, [t.testId]: v as NormalizedTestDecision }))
                      }
                      disabled={busy !== null}
                      items={patientTestQualDecisionSelectItems}
                    >
                      <SelectTrigger className="h-9 max-w-[280px] text-sm">
                        <SelectValue placeholder="Выберите итог" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">{formatNormalizedTestDecisionRu("passed")}</SelectItem>
                        <SelectItem value="failed">{formatNormalizedTestDecisionRu("failed")}</SelectItem>
                        <SelectItem value="partial">{formatNormalizedTestDecisionRu("partial")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className={cn(patientMutedTextClass, "text-[11px]")}>Комментарий (необязательно)</Label>
                    <Textarea
                      className={cn(patientFormSurfaceClass, "min-h-[72px] text-sm")}
                      value={qualNotes[t.testId] ?? ""}
                      onChange={(e) => setQualNotes((s) => ({ ...s, [t.testId]: e.target.value }))}
                      disabled={busy !== null}
                      rows={3}
                    />
                  </div>
                  <button
                    type="button"
                    className={cn(patientCompactActionClass, "h-8 w-auto text-sm")}
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(itemId + t.testId);
                      setError(null);
                      try {
                        if (!(await ensureAttempt())) return;
                        const d = qualDecisions[t.testId];
                        if (d !== "passed" && d !== "failed" && d !== "partial") {
                          setError("Выберите итог: зачтено, не зачтено или частично.");
                          return;
                        }
                        const note = qualNotes[t.testId]?.trim() ?? "";
                        const res = await fetch(`${baseUrl}/${encodeURIComponent(itemId)}/progress/test-result`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            testId: t.testId,
                            rawValue: note ? { note } : {},
                            normalizedDecision: d,
                          }),
                        });
                        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
                        if (!res.ok || !data.ok) {
                          setError(data.error ?? "Ошибка сохранения");
                          return;
                        }
                        await onDone();
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      {testIds.length > 0 ? (
        <p className={cn(patientMutedTextClass, "text-[11px]")}>Тестов в наборе: {testIds.length}</p>
      ) : null}
    </div>
  );
}
