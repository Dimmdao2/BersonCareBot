"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import type {
  NormalizedTestDecision,
  TreatmentProgramInstanceDetail,
  TreatmentProgramTestResultDetailRow,
} from "@/modules/treatment-program/types";
import {
  effectiveInstanceStageItemComment,
  formatNormalizedTestDecisionRu,
  formatTreatmentProgramStageStatusRu,
} from "@/modules/treatment-program/types";
import {
  isInstanceStageItemActiveForPatient,
  isPersistentRecommendation,
  patientStageItemShowsNewBadge,
  patientStageSectionShouldRender,
  splitPatientProgramStagesForDetailUi,
  selectCurrentWorkingStageForPatientDetail,
  expectedStageControlDateIso,
} from "@/modules/treatment-program/stage-semantics";
import { testIdsFromTestSetSnapshot } from "@/modules/treatment-program/progress-service";
import { scoringAllowsNumericDecisionInference } from "@/modules/treatment-program/progress-scoring";
import { parseTestSetSnapshotTests } from "@/modules/treatment-program/testSetSnapshotView";
import { type PatientProgramChecklistRow } from "@/modules/treatment-program/patient-program-actions";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeCardHeroClass,
  patientHomeHeroBadgeClass,
  patientHomeHeroTitleClampClass,
  patientBadgeDurationClass,
  patientBadgeSuccessClass,
  patientBadgeDangerClass,
  patientBadgePrimaryClass,
} from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientListItemClass,
  patientMutedTextClass,
  patientPrimaryActionClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
  patientBodyTextClass,
  patientPillClass,
  patientFormSurfaceClass,
  patientSurfaceSuccessClass,
  patientSurfaceWarningClass,
  patientSecondaryActionClass,
  patientButtonSuccessClass,
  patientButtonWarningOutlineClass,
} from "@/shared/ui/patientVisual";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";

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

/** Бейдж в hero: назначена / старт / завершена (даты в часовом поясе приложения). */
function programInstanceHeroStatusBadge(
  detail: TreatmentProgramInstanceDetail,
  pipeline: InstanceStageRow[],
  appTz: string,
): { label: string; className: string } | null {
  if (detail.status === "completed") {
    return {
      label: `Завершена ${formatBookingDateLongRu(detail.updatedAt, appTz)}`,
      className: patientBadgeSuccessClass,
    };
  }
  const pipelineNonZero = pipeline.filter((s) => s.sortOrder > 0);
  const anyStarted = pipelineNonZero.some((s) => s.startedAt != null);
  if (!anyStarted) {
    return {
      label: `Назначена ${formatBookingDateLongRu(detail.createdAt, appTz)}`,
      className: patientBadgeDurationClass,
    };
  }
  const startedIsos = detail.stages
    .filter((s) => s.sortOrder > 0 && s.startedAt != null)
    .map((s) => s.startedAt as string);
  if (startedIsos.length === 0) {
    return {
      label: `Назначена ${formatBookingDateLongRu(detail.createdAt, appTz)}`,
      className: patientBadgeDurationClass,
    };
  }
  const minIso = startedIsos.reduce((a, b) => (a < b ? a : b));
  return {
    label: `Старт с ${formatBookingDateLongRu(minIso, appTz)}`,
    className: patientBadgeDurationClass,
  };
}

function PatientProgramStagesTimeline(props: {
  instanceId: string;
  stages: InstanceStageRow[];
  currentWorkingStage: InstanceStageRow | null;
  stageCountNonZero: number;
}) {
  const { instanceId, stages, currentWorkingStage, stageCountNonZero } = props;
  const [itemsModalStage, setItemsModalStage] = useState<InstanceStageRow | null>(null);

  return (
    <>
      <section
        id="patient-program-current-stage"
        className={patientCardClass}
        aria-labelledby="patient-program-stages-heading"
      >
        <h3 id="patient-program-stages-heading" className={cn(patientSectionTitleClass, "mb-3")}>
          Активный этап
        </h3>
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
                  className="mt-0.5 size-4 shrink-0 fill-none text-[var(--patient-color-primary)]"
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

            const titleClass = isActive
              ? "text-sm font-bold text-[var(--patient-color-primary)]"
              : isPast
                ? "text-sm font-medium text-foreground"
                : "text-sm font-medium text-muted-foreground";

            const titleBlock = (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={titleClass}>{stage.title}</span>
                  {isActive ? (
                    <span className={cn(patientBadgePrimaryClass, "h-6 max-w-full truncate px-2 text-[10px]")}>
                      {stage.sortOrder} из {stageCountNonZero}
                    </span>
                  ) : null}
                </div>
              </div>
            );

            const rowInner = (
              <div
                className={cn(
                  "flex items-start gap-3",
                  (isFuture || isStale) && "pointer-events-none cursor-default",
                )}
              >
                {leftIcon}
                {isActive || isPast ? (
                  <Link
                    href={routePaths.patientTreatmentProgramStage(instanceId, stage.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1 no-underline outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-2"
                  >
                    {titleBlock}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{titleBlock}</div>
                )}
                {isActive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-[var(--patient-color-primary)]"
                    aria-label="Состав этапа"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setItemsModalStage(stage);
                    }}
                  >
                    <List className="size-5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            );

            return (
              <li key={stage.id}>
                <div
                  className={cn(
                    rowClass,
                    (isActive || isPast) &&
                      "transition-colors hover:bg-[var(--patient-color-primary-soft)]/20",
                  )}
                >
                  {rowInner}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={itemsModalStage !== null} onOpenChange={(open) => !open && setItemsModalStage(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Состав этапа</DialogTitle>
          </DialogHeader>
          {itemsModalStage ? (
            <>
              <p className={cn(patientMutedTextClass, "text-sm")}>{itemsModalStage.title}</p>
              <ul className="m-0 mt-2 max-h-[50vh] list-none space-y-2 overflow-y-auto p-0">
                {(() => {
                  const vis = sortByOrderThenId(
                    itemsModalStage.items.filter((it) => isInstanceStageItemActiveForPatient(it)),
                  );
                  if (vis.length === 0) {
                    return (
                      <li className={cn(patientMutedTextClass, "text-sm")}>Нет элементов для отображения.</li>
                    );
                  }
                  return vis.map((it) => (
                    <li key={it.id} className={cn(patientListItemClass, "text-sm")}>
                      <span className="font-medium text-foreground">{snapshotTitle(it.snapshot, it.itemType)}</span>
                      <span className={cn(patientMutedTextClass, "ml-1 text-xs")}>({it.itemType})</span>
                    </li>
                  ));
                })()}
              </ul>
            </>
          ) : null}
        </DialogContent>
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
}) {
  const { stage } = props;
  if (!patientStageHasHeaderFields(stage)) return null;
  const durationLine = [
    stage.expectedDurationDays != null ? `${stage.expectedDurationDays} дн.` : null,
    stage.expectedDurationText?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn(patientSectionSurfaceClass, "mb-4 shadow-none")}>
      {stage.goals?.trim() ? (
        <div>
          <p className={patientSectionTitleClass}>Цель</p>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.goals.trim()}</p>
        </div>
      ) : null}
      {stage.objectives?.trim() ? (
        <div>
          <p className={patientSectionTitleClass}>Задачи</p>
          <p className={cn(patientBodyTextClass, "mt-1 whitespace-pre-wrap")}>{stage.objectives.trim()}</p>
        </div>
      ) : null}
      {durationLine ? (
        <div>
          <p className={patientSectionTitleClass}>Ожидаемый срок</p>
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
        "border-[var(--patient-border)]/80 bg-[var(--patient-color-primary-soft)]/10",
      )}
    >
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
        ) : null}{" "}
        <span className={cn(patientMutedTextClass, "font-normal")}>({item.itemType})</span>
      </p>
      {isPersistentRecommendation(item) ? (
        <p className="mt-1">
          <span className={patientPillClass}>Постоянная рекомендация</span>
        </p>
      ) : null}
      {effectiveInstanceStageItemComment(item) ? (
        <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
          Комментарий:{" "}
          <span className="text-foreground">{effectiveInstanceStageItemComment(item)}</span>
        </p>
      ) : null}
      <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
        Элемент:{" "}
        {item.completedAt ? (
          <span className="text-emerald-600 dark:text-emerald-400">выполнен</span>
        ) : (
          <span>не выполнен</span>
        )}
      </p>

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
              setError={setError}
            />
          </div>
        ) : !isPersistentRecommendation(item) ? (
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              className={cn(patientPrimaryActionClass, "!h-9 !min-h-0 w-auto px-3 text-sm")}
              disabled={Boolean(item.completedAt) || busy !== null}
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
              {item.completedAt ? "Готово" : "Отметить выполненным"}
            </Button>
          </div>
        ) : null
      ) : null}
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
  } = props;
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  const visibleItems = stage.items.filter(isInstanceStageItemActiveForPatient);
  const sortedGroups = sortByOrderThenId(stage.groups).filter((g) =>
    visibleItems.some((it) => it.groupId === g.id),
  );
  const ungroupedItems = sortByOrderThenId(visibleItems.filter((it) => !it.groupId));

  return (
    <section className={surfaceClass}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">{heading}</div>
      <PatientStageHeaderFields stage={stage} />
      {contentBlocked ? (
        <p className={patientMutedTextClass}>Этап откроется после завершения предыдущего или по решению врача.</p>
      ) : null}
      <div className="m-0 space-y-4 p-0">
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleItems.filter((it) => it.groupId === g.id));
          return (
            <details
              key={g.id}
              className={cn(
                patientListItemClass,
                "border-[var(--patient-border)]/80 bg-[var(--patient-color-primary-soft)]/5",
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
              <ul className="m-0 mt-3 list-none space-y-4 p-0">
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
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {ungroupedItems.length > 0 ? (
          <div className="space-y-3">
            {sortedGroups.length > 0 ? (
              <p className={cn(patientSectionTitleClass, "text-sm")}>Без группы</p>
            ) : null}
            <ul className="m-0 list-none space-y-4 p-0">
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
  setError: (e: string | null) => void;
}) {
  const { row, itemBaseUrl, done, onUpdated, setError } = props;
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  if (done) {
    return (
      <div className={cn(patientListItemClass, "flex flex-col gap-1 border-[var(--patient-border)]/70")}>
        <span className="text-sm font-medium">{snapshotTitle(row.item.snapshot, row.item.itemType)}</span>
        {row.groupTitle ? (
          <span className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</span>
        ) : null}
        <span className="text-xs text-emerald-600 dark:text-emerald-400">Сегодня занятие отмечено</span>
      </div>
    );
  }

  return (
    <div className={cn(patientFormSurfaceClass, "border border-[var(--patient-border)]/70")}>
      <p className="text-sm font-medium">{snapshotTitle(row.item.snapshot, row.item.itemType)}</p>
      {row.groupTitle ? <p className={cn(patientMutedTextClass, "text-xs")}>{row.groupTitle}</p> : null}
      <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-2">
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
      <Button
        type="button"
        size="sm"
        className={cn(patientPrimaryActionClass, "!h-9 w-fit")}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch(`${itemBaseUrl}/${encodeURIComponent(row.item.id)}/progress/lfk-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ difficulty, note: note.trim() || null }),
            });
            const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[]; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Ошибка сохранения");
              return;
            }
            if (data.doneItemIds) onUpdated(data.doneItemIds);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Сохраняю…" : "Сохранить"}
      </Button>
    </div>
  );
}

function PatientProgramControlCard(props: {
  controlLabel: string;
  instanceId: string;
  currentStageId: string | null;
}) {
  const { controlLabel, instanceId, currentStageId } = props;
  return (
    <section className={patientSurfaceWarningClass} aria-label="Следующий контроль">
      <div className="flex items-center gap-2">
        <CalendarCheck className="size-5 shrink-0 text-[var(--patient-color-warning)]" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide">Следующий контроль</p>
      </div>
      <p className="mt-1 text-2xl font-bold">{controlLabel}</p>
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
  appDisplayTimeZone: string;
  planUpdatedLabel: string | null;
  programDescription?: string | null;
}) {
  const { appDisplayTimeZone, planUpdatedLabel, programDescription = null } = props;
  const [detail, setDetail] = useState(props.initial);
  const [testResults, setTestResults] = useState(props.initialTestResults);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItemIds, setDoneItemIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setError(null);
    const id = detail.id;
    const [instRes, trRes, checklistRes] = await Promise.all([
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/test-results`),
      fetch(`/api/patient/treatment-program-instances/${encodeURIComponent(id)}/checklist-today`),
    ]);
    const data = (await instRes.json().catch(() => null)) as { ok?: boolean; item?: TreatmentProgramInstanceDetail };
    if (!instRes.ok || !data.ok || !data.item) {
      setError("Не удалось обновить данные");
      return;
    }
    setDetail(data.item);
    const trData = (await trRes.json().catch(() => null)) as { ok?: boolean; results?: TreatmentProgramTestResultDetailRow[] };
    if (trRes.ok && trData.ok && trData.results) setTestResults(trData.results);
    const chData = (await checklistRes.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
    if (data.item.status === "active" && checklistRes.ok && chData.ok && Array.isArray(chData.doneItemIds)) {
      setDoneItemIds(chData.doneItemIds);
    } else {
      setDoneItemIds([]);
    }
  }, [detail.id]);

  const base = `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/items`;

  useEffect(() => {
    void (async () => {
      if (detail.status !== "active") {
        setDoneItemIds([]);
        return;
      }
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(detail.id)}/checklist-today`,
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean; doneItemIds?: string[] };
      if (res.ok && data?.ok && Array.isArray(data.doneItemIds)) setDoneItemIds(data.doneItemIds);
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

  const heroStatusBadge = useMemo(
    () => programInstanceHeroStatusBadge(detail, pipelineStages, appDisplayTimeZone),
    [detail, pipelineStages, appDisplayTimeZone],
  );

  const awaitsStart =
    detail.status === "active" &&
    currentWorkingStage != null &&
    currentWorkingStage.status === "available";

  const controlIso = currentWorkingStage ? expectedStageControlDateIso(currentWorkingStage) : null;
  const controlLabel =
    controlIso && appDisplayTimeZone ? formatBookingDateLongRu(controlIso, appDisplayTimeZone) : null;

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* C1: Hero card — фон/бордер/бейджи как hero «Разминка дня» на главной */}
      <div className={cn(patientHomeCardHeroClass, "relative isolate overflow-hidden p-4 lg:p-5")}>
        <div className="relative z-20 flex min-h-6 shrink-0 flex-wrap items-start gap-1.5">
          <span className={patientHomeHeroBadgeClass}>Мой план</span>
          {heroStatusBadge ? (
            <span
              className={cn(heroStatusBadge.className, "max-w-[min(100%,16rem)] truncate")}
              title={heroStatusBadge.label}
            >
              {heroStatusBadge.label}
            </span>
          ) : null}
        </div>
        <h2 className={patientHomeHeroTitleClampClass}>{detail.title}</h2>
        {programDescription?.trim() ? (
          <p className={cn(patientMutedTextClass, "mt-2 line-clamp-3 text-sm leading-snug")}>
            {programDescription.trim()}
          </p>
        ) : null}
        {planUpdatedLabel?.trim() ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium" role="status">
            <span className="text-destructive" aria-hidden="true">●</span>
            {planUpdatedLabel.trim()}
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
              patientPrimaryActionClass,
              "mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold shadow-[0_6px_14px_rgba(40,77,160,0.24)] lg:min-h-12 lg:text-base",
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

      {/* C2: Control card */}
      {controlLabel ? (
        <PatientProgramControlCard
          controlLabel={controlLabel}
          instanceId={detail.id}
          currentStageId={currentWorkingStage?.id ?? null}
        />
      ) : null}

      {/* C3: Stage 0 in Collapsible (closed by default) */}
      {stageZeroStages.map((stage) => (
        <Collapsible key={stage.id} className={cn(patientSurfaceSuccessClass, "overflow-hidden p-0")}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 p-4 text-left lg:p-[18px]">
            <Shield
              className="size-4 shrink-0 text-[var(--patient-color-success)]"
              aria-hidden="true"
            />
            <span className={patientSectionTitleClass}>Рекомендации на период</span>
            <span className={cn(patientMutedTextClass, "ml-auto mr-2 hidden text-xs sm:block")}>
              Общие рекомендации на всю программу
            </span>
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-data-[open]/collapsible:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-[var(--patient-surface-success-border)]">
            <PatientInstanceStageBody
              instanceId={detail.id}
              stage={stage}
              base={base}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              refresh={refresh}
              ignoreStageLockForContent
              surfaceClass="flex flex-col gap-4 p-4 lg:p-[18px]"
              doneItemIds={doneItemIds}
              onDoneItemIds={setDoneItemIds}
              heading={
                <>
                  <h3 className={patientSectionTitleClass}>Назначения</h3>
                  {stage.title.trim() ? (
                    <span className={cn(patientMutedTextClass, "text-xs font-normal normal-case")}>
                      {stage.title}
                    </span>
                  ) : null}
                </>
              }
            />
          </CollapsibleContent>
        </Collapsible>
      ))}

      {stagesTimeline.length > 0 ? (
        <PatientProgramStagesTimeline
          instanceId={detail.id}
          stages={stagesTimeline}
          currentWorkingStage={currentWorkingStage}
          stageCountNonZero={stageCountNonZero}
        />
      ) : null}

      {/* C5: Test history entry point */}
      {detail.status === "active" && currentWorkingStage ? (
        <section className={patientCardClass} aria-label="История тестирования">
          <div className="flex items-center gap-2">
            <ClipboardList
              className="size-4 shrink-0 text-[var(--patient-color-primary)]"
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold">История тестирования</h3>
          </div>
          <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>
            Результаты тестов за все этапы программы.
          </p>
          <Link
            href={routePaths.patientTreatmentProgramStage(detail.id, currentWorkingStage.id)}
            className={cn(patientSecondaryActionClass, "mt-3")}
          >
            Открыть текущий этап
          </Link>
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
                  <Button
                    type="button"
                    size="sm"
                    className={cn(patientPrimaryActionClass, "!h-8 !min-h-0 w-auto px-3 text-sm")}
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
                  </Button>
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
                  <Button
                    type="button"
                    size="sm"
                    className={cn(patientPrimaryActionClass, "!h-8 !min-h-0 w-auto px-3 text-sm")}
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
                  </Button>
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
