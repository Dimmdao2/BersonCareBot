"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
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
import { PatientModalDialogContent } from "@/shared/ui/patient/PatientModalDialogContent";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield,
  ChevronDown,
  CheckCircle2,
  CalendarCheck,
  ClipboardList,
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
  isInstanceStageItemShownInPatientCompositionModal,
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
  patientStageItemShowsNewBadge,
  patientStageSectionShouldRender,
  splitPatientProgramStagesForDetailUi,
  selectCurrentWorkingStageForPatientDetail,
  expectedStageControlDateIso,
} from "@/modules/treatment-program/stage-semantics";
import { listLfkSnapshotExerciseLines } from "@/modules/treatment-program/programActionActivityKey";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/progress-service";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import {
  normalizeChecklistCountMap,
  normalizeChecklistLastMap,
} from "@/app/app/patient/treatment-programs/normalizeTreatmentProgramChecklistMaps";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientCardListSectionClass,
  patientCardNestedListSurfaceClass,
  patientListItemClass,
  patientMutedTextClass,
  patientHeroPrimaryActionClass,
  patientModalPortalPrimaryCtaClass,
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

/** Склонение «N дней» для строки занятости в hero. */
function ruProgramEngagementDaysWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/** Минимальный `started_at` среди этапов с `sortOrder > 0`; иначе дата назначения экземпляра. */
function patientProgramHeroEngagementStartIso(detail: TreatmentProgramInstanceDetail): string {
  const started: string[] = [];
  for (const s of detail.stages) {
    if (s.sortOrder <= 0) continue;
    const st = s.startedAt;
    if (st == null || String(st).trim() === "") continue;
    started.push(String(st));
  }
  if (started.length === 0) return detail.createdAt;
  return started.reduce((a, b) => (a < b ? a : b));
}

/** Календарные дни от начала до «сегодня» в таймзоне приложения, включительно (минимум 1). */
function patientProgramHeroInclusiveEngagementDayCount(
  startIso: string,
  appDisplayTimeZone: string,
  now: DateTime = DateTime.now(),
): number {
  const startDay = DateTime.fromISO(startIso, { zone: appDisplayTimeZone }).startOf("day");
  const today = now.setZone(appDisplayTimeZone).startOf("day");
  if (!startDay.isValid) return 1;
  const raw = Math.floor(today.diff(startDay, "days").days);
  return Math.max(1, raw + 1);
}

/** Единый заголовок секции (после hero): иконка слева, заголовок, опционально действие справа. */
function PatientProgramBlockHeading(props: {
  id?: string;
  title: string;
  Icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName?: string;
  trailing?: ReactNode;
  className?: string;
  /** Внутри `button` (коллапс) — без `h3`. */
  titleAs?: "h3" | "span";
}) {
  const { id, title, Icon, iconClassName, trailing, className, titleAs = "h3" } = props;
  const titleClass = patientSectionTitleClass;
  return (
    <div className={cn("mb-3 flex min-w-0 items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? (
          <Icon className={cn("size-4 shrink-0", iconClassName)} aria-hidden />
        ) : null}
        {titleAs === "span" ? (
          <span className={titleClass}>{title}</span>
        ) : (
          <h3 id={id} className={titleClass}>
            {title}
          </h3>
        )}
      </div>
      {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}

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

/** Plain-текст из `bodyMd` снимка рекомендации для превью под заголовком (без рендера MD). */
function recommendationBodyMdPreviewPlain(bodyMd: unknown): string {
  if (typeof bodyMd !== "string" || !bodyMd.trim()) return "";
  let s = bodyMd.trim();
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1 ");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Разбор `snapshot.media` для превью строки: рекомендация (`mediaUrl`), упражнение ЛФК (`url` + `type`). */
function parseSnapshotMediaForRowThumb(snapshot: Record<string, unknown>): RecommendationMediaItem[] {
  const raw = snapshot.media;
  if (!Array.isArray(raw)) return [];
  const items: RecommendationMediaItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const mediaUrl =
      typeof o.mediaUrl === "string"
        ? o.mediaUrl.trim()
        : typeof o.url === "string"
          ? o.url.trim()
          : "";
    if (!mediaUrl) continue;
    const mt = o.mediaType ?? o.type;
    const mediaType: RecommendationMediaItem["mediaType"] =
      mt === "video" || mt === "gif" || mt === "image" ? mt : "image";
    const sortOrder = typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : 0;
    const previewSmUrl =
      typeof o.previewSmUrl === "string" && o.previewSmUrl.trim() ? o.previewSmUrl.trim() : null;
    const previewMdUrl =
      typeof o.previewMdUrl === "string" && o.previewMdUrl.trim() ? o.previewMdUrl.trim() : null;
    const ps = o.previewStatus;
    const previewStatus =
      ps === "pending" || ps === "ready" || ps === "failed" || ps === "skipped" ? ps : null;
    items.push({
      mediaUrl,
      mediaType,
      sortOrder,
      ...(previewSmUrl ? { previewSmUrl } : {}),
      ...(previewMdUrl ? { previewMdUrl } : {}),
      ...(previewStatus ? { previewStatus } : {}),
    });
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.mediaUrl.localeCompare(b.mediaUrl));
  return items;
}

function parseRecommendationMediaFromSnapshot(snapshot: Record<string, unknown>): RecommendationMediaItem[] {
  return parseSnapshotMediaForRowThumb(snapshot);
}

/** Статичное превью в строке списка: сначала картинка/GIF, иначе первое медиа (видео). */
function pickRecommendationRowPreviewMedia(items: RecommendationMediaItem[]): RecommendationMediaItem | null {
  if (items.length === 0) return null;
  const still = items.find((m) => m.mediaType === "image" || m.mediaType === "gif");
  return still ?? items[0] ?? null;
}

type InstanceStageRow = TreatmentProgramInstanceDetail["stages"][number];

/** Макс. зелёных точек «сегодня» в модалке — остаток числом (а11y через aria-label). */
const MAX_COMPOSITION_TODAY_DOTS = 24;

function mergeLastActivityDisplayedIso(logIso: string | undefined, completedAt: string | null): string | null {
  const tLog = logIso?.trim() ? Date.parse(logIso) : NaN;
  const tDone = completedAt?.trim() ? Date.parse(completedAt) : NaN;
  if (!Number.isFinite(tLog) && !Number.isFinite(tDone)) return null;
  if (!Number.isFinite(tLog)) return completedAt!.trim();
  if (!Number.isFinite(tDone)) return logIso!.trim();
  return tLog >= tDone ? logIso!.trim() : completedAt!.trim();
}

function PatientCompositionItemProgressAside(props: {
  parentItem: InstanceStageRow["items"][number];
  activityKey: string;
  appDisplayTimeZone: string;
  doneTodayCountByActivityKey: Readonly<Record<string, number>>;
  lastDoneAtIsoByActivityKey: Readonly<Record<string, string>>;
}) {
  const { parentItem, activityKey, appDisplayTimeZone, doneTodayCountByActivityKey, lastDoneAtIsoByActivityKey } =
    props;
  const completedAtForMerge = activityKey === parentItem.id ? parentItem.completedAt : null;
  const lastIso = mergeLastActivityDisplayedIso(
    lastDoneAtIsoByActivityKey[activityKey],
    completedAtForMerge,
  );
  const todayCount = doneTodayCountByActivityKey[activityKey] ?? 0;
  const dotCount = Math.min(todayCount, MAX_COMPOSITION_TODAY_DOTS);
  const dotOverflow = todayCount > MAX_COMPOSITION_TODAY_DOTS ? todayCount - MAX_COMPOSITION_TODAY_DOTS : 0;
  const line1 = lastIso
    ? `Выполнялось ${formatBookingDateTimeShortStyleRu(lastIso, appDisplayTimeZone)}`
    : "Пока без отметок";

  return (
    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 text-right">
      <span className="max-w-[9.5rem] text-[10px] font-normal leading-tight text-muted-foreground">{line1}</span>
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
                  className="size-2 shrink-0 rounded-full bg-[var(--patient-color-success)]"
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
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--patient-color-primary)] outline-none transition-opacity touch-manipulation",
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
      return {
        key: `${item.id}:ex:${line.exerciseId}`,
        activityKey: `${item.id}:ex:${line.exerciseId}`,
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
}) {
  const {
    stages,
    currentWorkingStage,
    stageCountNonZero,
    detail,
    appDisplayTimeZone,
    doneTodayCountByActivityKey,
    lastDoneAtIsoByActivityKey,
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
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {stages.map((stage) => {
            const isActive = currentWorkingStage?.id === stage.id;
            const isPast = stage.status === "completed" || stage.status === "skipped";
            const isFuture = !isActive && !isPast && stage.status === "locked";
            const isStale =
              !isActive && !isPast && (stage.status === "available" || stage.status === "in_progress");

            let rowClass = patientListItemClass;
            let leftIcon: ReactNode;
            if (isActive) {
              rowClass = cn(
                patientListItemClass,
                "border-l-4 border-l-[var(--patient-color-primary)] bg-[var(--patient-color-primary-soft)]/15",
              );
              leftIcon = (
                <Play
                  className="size-4 shrink-0 fill-none text-[var(--patient-color-primary)]"
                  strokeWidth={2.5}
                  aria-hidden
                />
              );
            } else if (isPast) {
              rowClass = cn(patientListItemClass, "bg-muted/20 opacity-70");
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
              rowClass = cn(patientListItemClass, "opacity-50");
              leftIcon = <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
            }

            rowClass = cn(rowClass, "pb-2");

            const titleClass = isActive
              ? "text-sm font-bold text-[var(--patient-color-primary)]"
              : isPast
                ? "text-sm font-medium text-foreground"
                : "text-sm font-medium text-muted-foreground";

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
                      "h-6 max-w-full shrink-0 truncate px-2 text-[10px]",
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
                      "w-full cursor-pointer text-left transition-colors hover:bg-[var(--patient-color-primary-soft)]/20",
                      "outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-2",
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
        <PatientModalDialogContent
          title={stageForModal?.title ?? ""}
          topSlot={
            detail.status === "active" && currentWorkingStage ? (
              <Link
                href={routePaths.patientTreatmentProgramStage(detail.id, currentWorkingStage.id)}
                className={patientModalPortalPrimaryCtaClass}
              >
                <PlayCircle className="size-5 shrink-0 lg:size-6" aria-hidden />
                Начать занятие
              </Link>
            ) : null
          }
        >
          {stageForModal ? (
            <>
              {(() => {
                  const visibleItems = sortByOrderThenId(
                    stageForModal.items.filter((it) => isInstanceStageItemShownInPatientCompositionModal(it)),
                  );
                  if (visibleItems.length === 0) {
                    return <p className="text-sm font-normal text-muted-foreground">Нет элементов для отображения.</p>;
                  }
                  const sortedGroups = sortByOrderThenId(stageForModal.groups).filter((g) =>
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
                        className={cn(stageCompositionModalRowClass, "flex items-stretch gap-2 px-2 py-2")}
                      >
                        <div
                          className={cn(
                            "min-w-0 flex-1 flex gap-2",
                            showMediaCol ? "items-stretch" : "items-start",
                          )}
                        >
                          <PatientCompositionModalMediaLeading
                            thumbMedia={row.thumbMedia}
                            emptyMediaSlotKind={row.emptyMediaSlotKind}
                          />
                          <span
                            className={cn(
                              "text-[#444444]",
                              showMediaCol ? "min-w-0 flex-1 py-0.5" : "block min-w-0",
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
                            "m-0 list-none space-y-1.5 p-0",
                            sortedGroups.length > 0 && "mb-3",
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
                            <ul className="m-0 list-none space-y-1.5 p-0">{gItems.flatMap(renderCompositionItem)}</ul>
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

function patientStageHasHeaderFields(stage: {
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
}): boolean {
  return Boolean(
    stage.goals?.trim() ||
      stage.objectives?.trim() ||
      stage.expectedDurationDays != null ||
      Boolean(stage.expectedDurationText?.trim()),
  );
}

function PatientStageHeaderFields(props: {
  stage: {
    goals: string | null;
    objectives: string | null;
    expectedDurationDays: number | null;
    expectedDurationText: string | null;
  };
  /** Узкие отступы — как у списка этапов на странице программы. */
  compactSpacing?: boolean;
}) {
  const { stage, compactSpacing } = props;
  if (!patientStageHasHeaderFields(stage)) return null;
  const durationLine = [
    stage.expectedDurationDays != null ? `${stage.expectedDurationDays} дн.` : null,
    stage.expectedDurationText?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        compactSpacing ? patientCardNestedListSurfaceClass : patientSectionSurfaceClass,
        "shadow-none",
        compactSpacing ? "mb-3" : "mb-4",
      )}
    >
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
      {durationLine ? (
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
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  /** Сколько строк `done` за сегодня по этому элементу (GET checklist-today). */
  todayChecklistDoneCount?: number;
  /** Нейтральный фон карточки (белый) на тонированной панели — блок рекомендаций на detail. */
  neutralItemChrome?: boolean;
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
    doneItemIds,
    onDoneItemIds,
    todayChecklistDoneCount,
    neutralItemChrome = false,
  } = props;
  const [markingViewed, setMarkingViewed] = useState(false);
  const showsNew = patientStageItemShowsNewBadge(item, contentBlocked);
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
  return (
    <li
      ref={markRef}
      className={cn(
        patientListItemClass,
        "border-[var(--patient-border)]/80",
        neutralItemChrome
          ? "bg-[var(--patient-card-bg)]"
          : "bg-[var(--patient-color-primary-soft)]/10",
        item.itemType === "recommendation" && "flex gap-3",
      )}
    >
      {item.itemType === "recommendation" ? (
        <PatientCatalogMediaStaticThumb
          media={recommendationPreviewMedia}
          frameClassName="size-12 rounded-md border border-[var(--patient-border)]/70"
          sizes="48px"
        />
      ) : null}
      <div className={cn(item.itemType === "recommendation" && "min-w-0 flex-1")}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{snapshotTitle(item.snapshot, item.itemType)}</span>
        {showsNew ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className={patientPillClass}>Новое</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              disabled={markingViewed}
              onClick={async () => {
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
      {item.itemType === "recommendation" && recommendationBodyPreview ? (
        <p className={cn(patientLineClamp2Class, patientMutedTextClass, "mt-1 text-xs leading-snug")}>
          {recommendationBodyPreview}
        </p>
      ) : null}
      {effectiveInstanceStageItemComment(item) ? (
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
      {todayChecklistDoneCount != null && todayChecklistDoneCount > 0 ? (
        <p className={cn(patientMutedTextClass, "mt-0.5 text-[11px] leading-snug")}>
          Отметок в журнале за сегодня:{" "}
          <span className="font-medium text-foreground">{todayChecklistDoneCount}</span>
        </p>
      ) : null}

      {!contentBlocked ? (
        item.itemType === "test_set" ? (
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
        ) : item.itemType === "lfk_complex" && !isPersistentRecommendation(item) ? (
          <div className="mt-2">
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
              onClick={async () => {
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
      </div>
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
  } = props;
  const likeStages = stackVariant === "likeStagesTimeline";
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  const visibleItems = stage.items.filter(isInstanceStageItemShownOnPatientProgramSurfaces);
  const sortedGroups = sortByOrderThenId(stage.groups).filter((g) =>
    visibleItems.some((it) => it.groupId === g.id),
  );
  const ungroupedItems = sortByOrderThenId(visibleItems.filter((it) => !it.groupId));

  return (
    <section className={surfaceClass}>
      {heading != null ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-2">{heading}</div>
      ) : null}
      <PatientStageHeaderFields stage={stage} compactSpacing={likeStages} />
      {contentBlocked ? (
        <p className={patientMutedTextClass}>Этап откроется после завершения предыдущего или по решению врача.</p>
      ) : null}
      <div className={cn("m-0 p-0", likeStages ? "space-y-2" : "space-y-4")}>
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
          return (
            <details
              key={g.id}
              className={cn(
                patientListItemClass,
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
              <ul className={cn("m-0 list-none p-0", likeStages ? "mt-2 space-y-2" : "mt-3 space-y-4")}>
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
                    doneItemIds={doneItemIds}
                    onDoneItemIds={onDoneItemIds}
                    todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                    neutralItemChrome={likeStages}
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {ungroupedItems.length > 0 ? (
          <div className={likeStages ? "space-y-2" : "space-y-3"}>
            {sortedGroups.length > 0 ? (
              <h3 className={cn(patientSectionTitleClass, "text-sm")}>Без группы</h3>
            ) : null}
            <ul className={cn("m-0 list-none p-0", likeStages ? "space-y-2" : "space-y-4")}>
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
                  doneItemIds={doneItemIds}
                  onDoneItemIds={onDoneItemIds}
                  todayChecklistDoneCount={todayCountByStageItemId?.[item.id]}
                  neutralItemChrome={likeStages}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
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
    <div className={cn(patientFormSurfaceClass, "border border-[var(--patient-border)]/70")}>
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
  /** Дата контроля (крупная строка); если null — показывается {@link fallbackMessage}. */
  dateLine: string | null;
  fallbackMessage: string;
  instanceId: string;
  currentStageId: string | null;
}) {
  const { dateLine, fallbackMessage, instanceId, currentStageId } = props;
  return (
    <section className={patientSurfaceWarningClass} aria-label="Следующий контроль">
      <PatientProgramBlockHeading
        title="Следующий контроль"
        Icon={CalendarCheck}
        iconClassName="text-[var(--patient-color-warning)]"
      />
      {dateLine ? (
        <p className="text-2xl font-bold">{dateLine}</p>
      ) : (
        <p className={cn(patientMutedTextClass, "text-base font-semibold leading-snug")}>{fallbackMessage}</p>
      )}
      <p className={cn(patientMutedTextClass, "mt-0.5 text-xs")}>Консультация со специалистом</p>
      <div className="mt-3 flex flex-row gap-2">
        {currentStageId ? (
          <Link
            href={routePaths.patientTreatmentProgramStage(instanceId, currentStageId)}
            className={cn(patientButtonWarningOutlineClass, "flex-1")}
          >
            Выполнить тесты
          </Link>
        ) : null}
        <Link href={routePaths.cabinet} className={cn(patientButtonSuccessClass, "flex-1")}>
          Записаться на приём
        </Link>
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
}) {
  const {
    appDisplayTimeZone,
    programDescription = null,
    initialProgramEvents = [],
  } = props;
  const [detail, setDetail] = useState(props.initial);
  const [testResults, setTestResults] = useState(props.initialTestResults);
  const [programEvents, setProgramEvents] = useState(initialProgramEvents);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);
  const [doneTodayCountByActivityKey, setDoneTodayCountByActivityKey] = useState<Record<string, number>>({});
  const [lastDoneAtIsoByActivityKey, setLastDoneAtIsoByActivityKey] = useState<Record<string, string>>({});
  const [doneTodayCountByItemId, setDoneTodayCountByItemId] = useState<Record<string, number>>({});

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
    };
    if (data.item.status !== "active") {
      setDoneItemIds([]);
      setDoneTodayCountByActivityKey({});
      setLastDoneAtIsoByActivityKey({});
      setDoneTodayCountByItemId({});
    } else if (checklistRes.ok && chData?.ok === true && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
      setDoneTodayCountByActivityKey(normalizeChecklistCountMap(chData.doneTodayCountByActivityKey));
      setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(chData.lastDoneAtIsoByActivityKey));
      setDoneTodayCountByItemId(normalizeChecklistCountMap(chData.doneTodayCountByItemId));
    }
  }, [detail.id]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/items`;

  useEffect(() => {
    void (async () => {
      if (detail.status !== "active") {
        setDoneItemIds([]);
        setDoneTodayCountByActivityKey({});
        setLastDoneAtIsoByActivityKey({});
        setDoneTodayCountByItemId({});
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
      };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) {
        setDoneItemIds(data.doneItemIds);
        setDoneTodayCountByActivityKey(normalizeChecklistCountMap(data.doneTodayCountByActivityKey));
        setLastDoneAtIsoByActivityKey(normalizeChecklistLastMap(data.lastDoneAtIsoByActivityKey));
        setDoneTodayCountByItemId(normalizeChecklistCountMap(data.doneTodayCountByItemId));
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

  const heroEngagementDayCount = useMemo(() => {
    if (detail.status !== "active" || awaitsStart) return null;
    const startIso = patientProgramHeroEngagementStartIso(detail);
    return patientProgramHeroInclusiveEngagementDayCount(startIso, appDisplayTimeZone);
  }, [detail, awaitsStart, appDisplayTimeZone]);

  const controlIso = currentWorkingStage ? expectedStageControlDateIso(currentWorkingStage) : null;
  const controlDateLine =
    controlIso && appDisplayTimeZone ? formatBookingDateLongRu(controlIso, appDisplayTimeZone) : null;
  const controlFallbackMessage =
    currentWorkingStage?.expectedDurationText?.trim() || "Срок консультации уточняется у врача.";
  /** Карточка контроля: после старта этапа (не «ожидает старта»), даже если нет срока в днях для расчёта даты. */
  const showNextControlCard =
    detail.status === "active" && currentWorkingStage != null && !awaitsStart;

  return (
    <div className={patientInnerPageStackClass}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* C1: Hero — компактный заголовок; история по (i) */}
      <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 pt-3 lg:p-5")}>
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
        {heroEngagementDayCount != null ? (
          <p
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[var(--patient-text-primary)]"
            role="status"
          >
            <span
              className="size-2 shrink-0 rounded-full bg-[var(--patient-color-success)]"
              aria-hidden
            />
            {`Вы занимаетесь ${heroEngagementDayCount} ${ruProgramEngagementDaysWord(heroEngagementDayCount)}`}
          </p>
        ) : null}
        {awaitsStart ? (
          <p className="mt-2" role="status">
            <span className={patientBadgeDangerClass}>Ожидает старта</span>
          </p>
        ) : null}
        {currentWorkingStage ? (
          <Link
            href={routePaths.patientTreatmentProgramStage(detail.id, currentWorkingStage.id)}
            className={cn(
              patientHeroPrimaryActionClass,
              "mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm shadow-[0_6px_14px_rgba(40,77,160,0.24)] lg:min-h-12 lg:text-base",
            )}
          >
            <PlayCircle className="size-5 shrink-0 lg:size-6" aria-hidden />
            Начать занятие
          </Link>
        ) : detail.status !== "active" ? (
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>Программа завершена.</p>
        ) : (
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>Нет активного этапа.</p>
        )}
      </div>

      {/* C2: Control card — после старта этапа; дата только при startedAt + expectedDurationDays */}
      {showNextControlCard ? (
        <PatientProgramControlCard
          dateLine={controlDateLine}
          fallbackMessage={controlFallbackMessage}
          instanceId={detail.id}
          currentStageId={currentWorkingStage.id}
        />
      ) : null}

      {/* C3: Stage 0 in Collapsible (closed by default) */}
      {stageZeroStages.map((stage) => (
        <Collapsible key={stage.id} className={cn(patientCardListSectionClass, "overflow-hidden p-0 lg:p-0")}>
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center px-3 py-4 text-left lg:px-4 lg:py-[18px]",
              "bg-[var(--patient-surface-success-border)] text-[var(--patient-surface-success-text)]",
            )}
          >
            <PatientProgramBlockHeading
              className="mb-0 w-full items-center"
              Icon={Shield}
              iconClassName="text-[var(--patient-surface-success-accent)]"
              title="Рекомендации"
              titleAs="span"
              trailing={
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-data-[open]/collapsible:rotate-180"
                  aria-hidden="true"
                />
              }
            />
          </CollapsibleTrigger>
          <CollapsibleContent
            className={cn("border-t border-[var(--patient-border)] bg-[var(--patient-surface-success-bg)]")}
          >
            <PatientInstanceStageBody
              instanceId={detail.id}
              stage={stage}
              base={base}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
              ignoreStageLockForContent
              surfaceClass="flex flex-col gap-2 px-3 py-4 lg:gap-2 lg:px-4 lg:py-[18px]"
              stackVariant="likeStagesTimeline"
              doneItemIds={doneItemIds}
              onDoneItemIds={setDoneItemIds}
              todayCountByStageItemId={doneTodayCountByItemId}
              heading={null}
            />
          </CollapsibleContent>
        </Collapsible>
      ))}

      {stagesTimeline.length > 0 ? (
        <PatientProgramStagesTimeline
          stages={stagesTimeline}
          currentWorkingStage={currentWorkingStage}
          stageCountNonZero={stageCountNonZero}
          detail={detail}
          appDisplayTimeZone={appDisplayTimeZone}
          doneTodayCountByActivityKey={doneTodayCountByActivityKey}
          lastDoneAtIsoByActivityKey={lastDoneAtIsoByActivityKey}
        />
      ) : null}

      {/* C5: Test history entry point */}
      {detail.status === "active" && currentWorkingStage ? (
        <section className={patientCardClass} aria-label="История тестирования">
          <PatientProgramBlockHeading
            title="История тестирования"
            Icon={ClipboardList}
            iconClassName="text-[var(--patient-color-primary)]"
          />
          <p className={cn(patientMutedTextClass, "text-xs")}>
            Результаты тестов за все этапы программы.
          </p>
        </section>
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
              className="flex flex-col gap-1 rounded-lg border border-[var(--patient-border)]/60 bg-[var(--patient-card-bg)] p-2"
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
