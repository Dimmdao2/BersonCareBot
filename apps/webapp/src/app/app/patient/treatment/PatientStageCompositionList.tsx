"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Dumbbell, ScrollText } from "lucide-react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  formatRelativePatientCalendarDayRu,
  isInstanceStageItemShownInPatientCompositionModal,
  sortDoctorInstanceStageGroupsForDisplay,
} from "@/modules/treatment-program/stage-semantics";
import { listLfkSnapshotExerciseLines, programActionDoneActivityKey } from "@/modules/treatment-program/programActionActivityKey";
import {
  mergeLastActivityDisplayedIso,
  parseSnapshotMediaForRowThumb,
  pickRecommendationRowPreviewMedia,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import {
  patientCompositionCurrentRowChromeClass,
  patientCompositionGroupTitleClass,
  patientCompositionListThumbSlotClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import type { PatientProgramItemNavMode } from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { sortProgramCompositionItemsByOrderThenId } from "@/app/app/patient/treatment/programCompositionOrder";

type InstanceStageRow = TreatmentProgramInstanceDetail["stages"][number];

const MAX_COMPOSITION_TODAY_DOTS = 24;

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

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

type CompositionModalEmptyMediaIcon = "exercise" | "recommendation";

type CompositionModalRow = {
  key: string;
  activityKey: string;
  text: string;
  thumbMedia: RecommendationMediaItem | null;
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
      const rowThumb =
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
        thumbMedia: rowThumb,
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

function PatientCompositionModalMediaLeading(props: {
  thumbMedia: RecommendationMediaItem | null;
  emptyMediaSlotKind: CompositionModalRow["emptyMediaSlotKind"];
}) {
  const { thumbMedia, emptyMediaSlotKind } = props;
  if (thumbMedia) {
    return (
      <PatientCatalogMediaStaticThumb
        media={thumbMedia}
        frameClassName={patientCompositionListThumbSlotClass}
        sizes="40px"
        iconClassName="size-4"
      />
    );
  }
  if (emptyMediaSlotKind === "exercise") {
    return (
      <div className={cn(patientCompositionListThumbSlotClass, "flex items-center justify-center")} aria-hidden>
        <Dumbbell className="size-4 text-muted-foreground" strokeWidth={2} />
      </div>
    );
  }
  if (emptyMediaSlotKind === "recommendation") {
    return (
      <div className={cn(patientCompositionListThumbSlotClass, "flex items-center justify-center")} aria-hidden>
        <ScrollText className="size-4 text-muted-foreground" strokeWidth={2} />
      </div>
    );
  }
  return null;
}

const stageCompositionModalRowClass =
  "rounded-md border border-border/60 bg-card text-xs font-normal leading-snug";

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
  const relativeWhenDone = lastIso ? formatRelativePatientCalendarDayRu(lastIso, appDisplayTimeZone) : null;
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
                <span key={i} className="size-2 shrink-0 rounded-full bg-[#16a34a]" aria-hidden />
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

export function PatientStageCompositionList(props: {
  instanceId: string;
  stage: InstanceStageRow;
  currentItemId: string;
  navMode: PatientProgramItemNavMode;
  appDisplayTimeZone: string;
  doneTodayCountByActivityKey: Readonly<Record<string, number>>;
  lastDoneAtIsoByActivityKey: Readonly<Record<string, string>>;
  doneTodayCountByItemId: Readonly<Record<string, number>>;
  className?: string;
}) {
  const {
    instanceId,
    stage,
    currentItemId,
    navMode,
    appDisplayTimeZone,
    doneTodayCountByActivityKey,
    lastDoneAtIsoByActivityKey,
    doneTodayCountByItemId,
    className,
  } = props;

  const navForPath = navMode === "default" ? undefined : navMode;
  const itemHref = (id: string) => routePaths.patientTreatmentProgramItem(instanceId, id, navForPath);

  const visibleItems = useMemo(
    () =>
      sortProgramCompositionItemsByOrderThenId(
        stage.items.filter((it) => isInstanceStageItemShownInPatientCompositionModal(it, stage.groups)),
      ),
    [stage],
  );

  if (visibleItems.length === 0) return null;

  const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups).filter((g) =>
    visibleItems.some((it) => it.groupId === g.id),
  );
  const ungroupedItems = sortProgramCompositionItemsByOrderThenId(visibleItems.filter((it) => !it.groupId));

  const renderCompositionItem = (it: (typeof visibleItems)[number]) => {
    const rows = compositionModalRowsForStageItem(it);
    return rows.map((row) => {
      const showMediaCol = compositionModalRowShowsMediaColumn(row);
      const rowIsCurrent = it.id === currentItemId;
      const rowInner = (
        <div
          className={cn(
            stageCompositionModalRowClass,
            "flex items-center gap-1.5 px-1.5 py-1.5",
            rowIsCurrent && patientCompositionCurrentRowChromeClass,
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-1 basis-0 gap-1.5",
              showMediaCol ? "items-center" : "items-start",
            )}
          >
            <PatientCompositionModalMediaLeading
              thumbMedia={row.thumbMedia}
              emptyMediaSlotKind={row.emptyMediaSlotKind}
            />
            <span
              className={cn(
                "min-w-0 self-center break-words text-[#444444]",
                showMediaCol ? "flex-1" : "block flex-1",
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
        </div>
      );

      const content =
        it.id === currentItemId ? (
          rowInner
        ) : (
          <Link href={itemHref(it.id)} className="block no-underline outline-none">
            {rowInner}
          </Link>
        );

      return (
        <li key={row.key} className="list-none">
          {content}
        </li>
      );
    });
  };

  return (
    <section
      className={cn(
        "mt-6 flex flex-col gap-2 border-t border-[var(--patient-border)]/40 pt-4",
        className,
      )}
      aria-labelledby="patient-stage-composition-heading"
    >
      <h2 id="patient-stage-composition-heading" className={patientSectionTitleClass}>
        Состав этапа
      </h2>
      {ungroupedItems.length > 0 ? (
        <ul className={cn("m-0 list-none space-y-1 p-0", sortedGroups.length > 0 && "mb-2")}>
          {ungroupedItems.flatMap(renderCompositionItem)}
        </ul>
      ) : null}
      {sortedGroups.map((g) => {
        const gItems = sortProgramCompositionItemsByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
        if (gItems.length === 0) return null;
        return (
          <section key={g.id} className="space-y-1">
            <div>
              <span className={patientCompositionGroupTitleClass}>{g.title}</span>
              {g.scheduleText?.trim() ? (
                <span className="mt-1 block text-xs font-normal text-muted-foreground">{g.scheduleText.trim()}</span>
              ) : null}
            </div>
            <ul className="m-0 list-none space-y-1 p-0">{gItems.flatMap(renderCompositionItem)}</ul>
          </section>
        );
      })}
    </section>
  );
}
