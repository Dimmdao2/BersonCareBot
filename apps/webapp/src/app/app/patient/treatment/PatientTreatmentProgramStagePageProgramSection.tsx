"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Info, NotebookText } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { isPersistentRecommendation } from "@/modules/treatment-program/stage-semantics";
import {
  mergeLastActivityDisplayedIso,
  primaryMediaForStageItem,
  recommendationBodyMdPreviewPlain,
  type InstanceStageItem,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  isItemDoneCooldownActive,
  planItemDoneRepeatCooldownMsFromMinutes,
} from "@/modules/treatment-program/itemDoneCooldown";
import {
  patientBodyTextClass,
  patientCardClass,
  patientCompactActionClass,
  patientMutedTextClass,
  patientSecondaryActionClass,
  patientSectionTitleClass,
  patientSimpleCompleteDoneButtonToneClass,
} from "@/shared/ui/patient/patientVisual";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/patient/primitives/popover";
import { MarkdownContent } from "@/shared/ui/patient/markdown/MarkdownContent";
import { cn } from "@/lib/utils";
import {
  buildProgramCompositionSegments,
  isProgramCompositionItem,
  sortProgramCompositionItemsByOrderThenId,
} from "@/app/app/patient/treatment/programCompositionOrder";
import { ProgramItemDiscussionDialog } from "./ProgramItemDiscussionDialog";
import { PatientProgramItemExecutionRow } from "./PatientProgramItemExecutionRow";
import { postProgramItemComplete } from "./postProgramItemComplete";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

/** Кнопка `progress/complete` на плитке — только для типов, которые реально поддерживают simple complete. */
function programTileShowsSimpleCompleteActions(item: InstanceStageItem): boolean {
  if (isPersistentRecommendation(item)) return false;
  if (item.itemType === "clinical_test") return false;
  return true;
}

function tileTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function pickFirstFiniteNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Бейдж «повторения×подходы» для плитки. У `exercise` нагрузка часто в `settings`, не в каталожном снимке —
 * объединяем settings → snapshot (как на экране врача).
 */
function programTileRepsSetsBadgeLabel(item: InstanceStageItem): string | null {
  if (item.itemType !== "exercise") return null;
  const snap = item.snapshot as Record<string, unknown>;
  const ov =
    item.settings != null && typeof item.settings === "object" && !Array.isArray(item.settings)
      ? (item.settings as Record<string, unknown>)
      : {};
  const reps = pickFirstFiniteNum(ov.reps, snap.reps);
  const sets = pickFirstFiniteNum(ov.sets, snap.sets);
  if (reps == null || sets == null) return null;
  return `${reps}×${sets}`;
}

function programTileDescriptionRaw(item: InstanceStageItem): { markdown: string | null; plain: string } {
  const snap = item.snapshot as Record<string, unknown>;
  if (item.itemType === "recommendation") {
    const bodyMd = typeof snap.bodyMd === "string" ? snap.bodyMd.trim() : "";
    if (!bodyMd) return { markdown: null, plain: "" };
    return { markdown: bodyMd, plain: recommendationBodyMdPreviewPlain(bodyMd) };
  }
  if (item.itemType === "lesson") {
    const p =
      (typeof snap.bodyPreview === "string" && snap.bodyPreview.trim()
        ? snap.bodyPreview.trim()
        : typeof snap.summary === "string" && snap.summary.trim()
          ? snap.summary.trim()
          : "") || "";
    return { markdown: null, plain: p };
  }
  const desc =
    typeof snap.description === "string" && snap.description.trim() ? snap.description.trim() : "";
  return { markdown: null, plain: desc };
}

function programTileContraindicationsPlain(item: InstanceStageItem): string {
  if (item.itemType !== "exercise") return "";
  const snap = item.snapshot as Record<string, unknown>;
  const c = typeof snap.contraindications === "string" ? snap.contraindications.trim() : "";
  return c;
}

function ProgramTileHintButton(props: { ariaLabel: string; icon: ReactNode; children: ReactNode }) {
  const { ariaLabel, icon, children } = props;
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex size-9 min-h-[40px] min-w-[40px] shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground outline-none transition-colors",
          "hover:bg-muted/50 active:bg-muted/70",
          "focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
        )}
        aria-label={ariaLabel}
      >
        {icon}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="max-h-[min(50vh,22rem)] w-[min(100%,20rem)] max-w-full overflow-y-auto p-3 text-xs leading-relaxed text-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

type ItemDiscussionSummary = {
  totalCount: number;
  unreadCount: number;
};

export type CompletionDifficulty = "easy" | "medium" | "hard";

export type CompletionMetricsDraft = {
  perceivedDifficulty: CompletionDifficulty;
  repsRaw: string;
  setsRaw: string;
  weightRaw: string;
  loading: boolean;
  saving: boolean;
};

export type CompletionMetricsPayload = {
  perceivedDifficulty: CompletionDifficulty;
  reps?: number;
  sets?: number;
  weightKg?: number;
};

export const DEFAULT_COMPLETION_METRICS_DRAFT: CompletionMetricsDraft = {
  perceivedDifficulty: "medium",
  repsRaw: "",
  setsRaw: "",
  weightRaw: "",
  loading: false,
  saving: false,
};

function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

function sanitizeWeightInput(raw: string): string {
  const normalized = raw.replace(",", ".");
  let out = "";
  let dotSeen = false;
  let decimalSeen = false;
  for (const ch of normalized) {
    if (/\d/.test(ch)) {
      if (dotSeen) {
        if (decimalSeen) continue;
        decimalSeen = true;
      }
      out += ch;
      continue;
    }
    if (ch === "." && !dotSeen) {
      dotSeen = true;
      out += ch;
    }
  }
  return out;
}

function optionalPositiveInt(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function optionalWeight(raw: string): number | undefined {
  if (!raw.trim() || raw.trim() === ".") return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10) / 10;
}

export function metricNumberToInput(v: number | null | undefined, decimal = false): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return decimal && !Number.isInteger(v) ? v.toFixed(1) : String(v);
}

export function draftToPayload(draft: CompletionMetricsDraft): CompletionMetricsPayload {
  return {
    perceivedDifficulty: draft.perceivedDifficulty,
    reps: optionalPositiveInt(draft.repsRaw),
    sets: optionalPositiveInt(draft.setsRaw),
    weightKg: optionalWeight(draft.weightRaw),
  };
}

function PatientProgramTileSimpleCompleteButton(props: {
  itemId: string;
  completedAt: string | null;
  lastDoneAtIso: string | undefined;
  busy: string | null;
  planItemDoneRepeatCooldownMs: number;
  containerClassName?: string;
  onComplete: (itemId: string) => void;
}) {
  const {
    itemId,
    completedAt,
    lastDoneAtIso,
    busy,
    planItemDoneRepeatCooldownMs,
    containerClassName,
    onComplete,
  } = props;
  const merged = mergeLastActivityDisplayedIso(lastDoneAtIso, completedAt);
  const doneFrozen = isItemDoneCooldownActive(merged, planItemDoneRepeatCooldownMs);

  return (
    <div className={cn("flex min-w-0 flex-1 basis-0 flex-col gap-0.5", containerClassName)}>
      <button
        type="button"
        className={cn(
          patientCompactActionClass,
          "min-h-9 min-w-0 flex-1 basis-0 px-2 py-2.5 text-xs font-medium leading-tight",
          doneFrozen && patientSimpleCompleteDoneButtonToneClass,
        )}
        disabled={busy !== null || doneFrozen}
        onClick={(e) => {
          e.stopPropagation();
          onComplete(itemId);
        }}
      >
        <span className="w-full text-center leading-tight">
          {doneFrozen ? "Выполнено" : "Отметить выполнение"}
        </span>
      </button>
    </div>
  );
}

export function CompletionMetricsPanel(props: {
  draft: CompletionMetricsDraft;
  onDraftChange: (draft: CompletionMetricsDraft) => void;
  onSave: () => void;
}) {
  const { draft, onDraftChange, onSave } = props;
  const difficultyOptions: Array<{ value: CompletionDifficulty; label: string }> = [
    { value: "easy", label: "Легко" },
    { value: "medium", label: "Средне" },
    { value: "hard", label: "Тяжело" },
  ];
  const fieldBase = cn(
    "h-10 w-full rounded-md border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-2 text-center text-sm tabular-nums outline-none",
    "focus-visible:ring-2 focus-visible:ring-[var(--patient-border)]",
  );

  return (
    <div className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-200 ease-out">
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-[var(--patient-border)] bg-[var(--patient-color-primary-soft)]/20 px-2.5 py-3">
          {draft.loading ? (
            <p className={cn(patientMutedTextClass, "text-xs")}>Готовим поля…</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-1.5">
                {difficultyOptions.map((opt) => {
                  const active = draft.perceivedDifficulty === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        "min-h-9 rounded-md border px-2 text-xs font-medium transition-colors",
                        active
                          ? "border-[var(--patient-color-primary)] bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]"
                          : "border-[var(--patient-border)] bg-[var(--patient-card-bg)] text-[var(--patient-text-secondary)]",
                      )}
                      onClick={() => onDraftChange({ ...draft, perceivedDifficulty: opt.value })}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-[11px]")}>повторы</span>
                  <input
                    value={draft.repsRaw}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    className={fieldBase}
                    onChange={(e) => onDraftChange({ ...draft, repsRaw: sanitizeIntegerInput(e.target.value) })}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-[11px]")}>подходы</span>
                  <input
                    value={draft.setsRaw}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    className={fieldBase}
                    onChange={(e) => onDraftChange({ ...draft, setsRaw: sanitizeIntegerInput(e.target.value) })}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={cn(patientMutedTextClass, "text-[11px]")}>вес, кг</span>
                  <input
                    value={draft.weightRaw}
                    inputMode="decimal"
                    autoComplete="off"
                    className={fieldBase}
                    onChange={(e) => onDraftChange({ ...draft, weightRaw: sanitizeWeightInput(e.target.value) })}
                  />
                </label>
              </div>
              <button
                type="button"
                className={cn(patientCompactActionClass, "min-h-9 w-full text-xs font-medium")}
                disabled={draft.saving}
                onClick={onSave}
              >
                {draft.saving ? "Сохраняю..." : "Записать"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PatientTreatmentProgramStagePageProgramSection(props: {
  instanceId: string;
  stage: Stage;
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  contentBlocked: boolean;
  itemInteraction: "full" | "readOnly";
  doneItemIds: string[];
  onDoneItemIds: (ids: string[]) => void;
  lastDoneAtIsoByItemId: Readonly<Record<string, string>>;
  /** Отметки за сегодня по `stage_item_id` (checklist-today), для точек «сегодня». */
  doneTodayCountByItemId: Readonly<Record<string, number>>;
  appDisplayTimeZone: string;
  className?: string;
  itemLinksPlanTab?: PatientPlanTab | null;
  planItemDoneRepeatCooldownMinutes: number;
  /** Комментарии к пунктам: видимость и доступность (support policy). */
  programCommentsInteraction: { visible: boolean; enabled: boolean };
  /** Медиа в диалоге обсуждения (не на плитке). */
  programMediaInteraction?: { visible: boolean; enabled: boolean };
}) {
  const {
    instanceId,
    stage,
    base,
    busy,
    setBusy,
    setError,
    refresh,
    contentBlocked,
    itemInteraction,
    doneItemIds,
    onDoneItemIds,
    lastDoneAtIsoByItemId,
    doneTodayCountByItemId,
    appDisplayTimeZone,
    className,
    itemLinksPlanTab = null,
    planItemDoneRepeatCooldownMinutes,
    programCommentsInteraction,
    programMediaInteraction = { visible: false, enabled: false },
  } = props;
  const planItemDoneRepeatCooldownMs = useMemo(
    () => planItemDoneRepeatCooldownMsFromMinutes(planItemDoneRepeatCooldownMinutes),
    [planItemDoneRepeatCooldownMinutes],
  );

  const [discussionDialogItemId, setDiscussionDialogItemId] = useState<string | null>(null);
  const [activeMetricsItemId, setActiveMetricsItemId] = useState<string | null>(null);
  const [metricsDraft, setMetricsDraft] = useState<CompletionMetricsDraft>(DEFAULT_COMPLETION_METRICS_DRAFT);
  const [discussionSummaryByItemId, setDiscussionSummaryByItemId] = useState<Record<string, ItemDiscussionSummary>>(
    {},
  );

  const readOnly = itemInteraction === "readOnly";
  const visibleProgramItems = useMemo(
    () => sortProgramCompositionItemsByOrderThenId(stage.items.filter((it) => isProgramCompositionItem(it, stage))),
    [stage],
  );

  const orderedSegments = useMemo(
    () => buildProgramCompositionSegments(stage, visibleProgramItems),
    [stage, visibleProgramItems],
  );

  const loadDiscussionSummary = useCallback(async () => {
    if (!programCommentsInteraction.visible) {
      setDiscussionSummaryByItemId({});
      return;
    }
    const itemIds = visibleProgramItems.map((item) => item.id);
    if (itemIds.length === 0) {
      setDiscussionSummaryByItemId({});
      return;
    }
    try {
      const url = new URL(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion/summary`,
        window.location.origin,
      );
      url.searchParams.set("itemIds", itemIds.join(","));
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; summaryByItemId?: Record<string, unknown> }
        | null;
      if (!res.ok || !data?.ok || !data.summaryByItemId || typeof data.summaryByItemId !== "object") {
        return;
      }
      const next: Record<string, ItemDiscussionSummary> = {};
      for (const itemId of itemIds) {
        const raw = data.summaryByItemId[itemId];
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const totalCount =
          typeof row.totalCount === "number" && Number.isFinite(row.totalCount) && row.totalCount > 0
            ? Math.floor(row.totalCount)
            : 0;
        const unreadCount =
          typeof row.unreadCount === "number" && Number.isFinite(row.unreadCount) && row.unreadCount > 0
            ? Math.floor(row.unreadCount)
            : 0;
        next[itemId] = { totalCount, unreadCount };
      }
      setDiscussionSummaryByItemId(next);
    } catch {
      // summary prefetch is best-effort; tile stays usable without counters.
    }
  }, [programCommentsInteraction.visible, instanceId, visibleProgramItems]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDiscussionSummary();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDiscussionSummary]);

  const loadLatestMetrics = useCallback(
    async (itemId: string): Promise<CompletionMetricsDraft> => {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(itemId)}/progress/complete/metrics`);
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          metrics?: {
            perceivedDifficulty?: CompletionDifficulty | null;
            difficulty?: CompletionDifficulty | null;
            reps?: number | null;
            sets?: number | null;
            weightKg?: number | null;
          } | null;
        } | null;
        const m = res.ok && data?.ok ? data.metrics : null;
        return {
          ...DEFAULT_COMPLETION_METRICS_DRAFT,
          perceivedDifficulty: m?.difficulty ?? m?.perceivedDifficulty ?? "medium",
          repsRaw: metricNumberToInput(m?.reps),
          setsRaw: metricNumberToInput(m?.sets),
          weightRaw: metricNumberToInput(m?.weightKg, true),
        };
      } catch {
        return DEFAULT_COMPLETION_METRICS_DRAFT;
      }
    },
    [base],
  );

  const handleTileComplete = useCallback(
    async (itemId: string) => {
      setActiveMetricsItemId(itemId);
      setMetricsDraft({ ...DEFAULT_COMPLETION_METRICS_DRAFT, loading: true });
      setBusy(itemId);
      setError(null);
      try {
        const previousDraft = await loadLatestMetrics(itemId);
        const result = await postProgramItemComplete({
          base,
          itemId,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMetricsDraft(previousDraft);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [base, loadLatestMetrics, refresh, setBusy, setError],
  );

  const saveMetrics = useCallback(
    async (itemId: string) => {
      setMetricsDraft((prev) => ({ ...prev, saving: true }));
      setError(null);
      try {
        const payload = draftToPayload(metricsDraft);
        const res = await fetch(`${base}/${encodeURIComponent(itemId)}/progress/complete/metrics`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "Не удалось сохранить значения");
          return;
        }
        setActiveMetricsItemId(null);
        await refresh();
      } finally {
        setMetricsDraft((prev) => ({ ...prev, saving: false }));
      }
    },
    [base, metricsDraft, refresh, setError],
  );

  if (visibleProgramItems.length === 0) return null;

  const itemProgramHref = (itemId: string) =>
    routePaths.patientTreatmentProgramItem(instanceId, itemId, "exec", itemLinksPlanTab ?? null);

  const renderTile = (item: InstanceStageItem): ReactNode => {
    const media = primaryMediaForStageItem(item);
    const lastIso = mergeLastActivityDisplayedIso(lastDoneAtIsoByItemId[item.id], item.completedAt);
    const todayCount = doneTodayCountByItemId[item.id] ?? 0;
    const readOnlyTile = readOnly || contentBlocked;
    const showSimpleCompleteFooter = !readOnlyTile && programTileShowsSimpleCompleteActions(item);

    const descRaw = programTileDescriptionRaw(item);
    const hasDescription = Boolean(descRaw.markdown?.trim()) || Boolean(descRaw.plain.trim());
    const contrText = programTileContraindicationsPlain(item);
    const doctorComment = item.effectiveComment?.trim() ?? "";
    const hasHintRow = hasDescription || Boolean(contrText) || Boolean(doctorComment);
    const repsSetsBadge = programTileRepsSetsBadgeLabel(item);
    const discussionSummary = discussionSummaryByItemId[item.id];
    const discussionCount = discussionSummary?.totalCount ?? 0;
    const discussionUnreadCount = discussionSummary?.unreadCount ?? 0;
    const hasDiscussionDot = discussionUnreadCount > 0;

    return (
      <li
        key={item.id}
        className={cn(
          patientCardClass,
          "list-none overflow-hidden p-0 shadow-sm",
        )}
      >
        <div className="flex flex-col p-2.5">
          <div className="flex items-stretch gap-2.5">
            <Link
              href={itemProgramHref(item.id)}
              className={cn(
                "relative size-[72px] shrink-0 cursor-pointer overflow-hidden rounded-md border-0 bg-muted/20 p-0 text-left no-underline outline-none",
                "ring-offset-background focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
              )}
              aria-label={`Открыть: ${tileTitle(item.snapshot as Record<string, unknown>, item.itemType)}`}
            >
              <PatientCatalogMediaStaticThumb
                media={media}
                frameClassName="h-full w-full rounded-none"
                sizes="72px"
              />
            </Link>
            <div className="flex min-h-[72px] min-w-0 flex-1 flex-col self-stretch">
              <Link
                href={itemProgramHref(item.id)}
                className={cn(
                  "flex min-h-[33px] shrink-0 gap-2 overflow-hidden no-underline outline-none",
                  "ring-offset-background focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
                )}
              >
                <span className="flex min-w-0 flex-1 items-start text-left">
                  <span className="line-clamp-2 break-words text-[13px] font-normal leading-tight text-foreground">
                    {tileTitle(item.snapshot as Record<string, unknown>, item.itemType)}
                  </span>
                </span>
                {repsSetsBadge ? (
                  <span className="shrink-0 self-end rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-neutral-800">
                    {repsSetsBadge}
                  </span>
                ) : null}
              </Link>

            <div className="mt-auto flex w-full min-w-0 shrink-0 items-start justify-between gap-2">
              <PatientProgramItemExecutionRow
                lastIso={lastIso}
                todayCount={todayCount}
                appDisplayTimeZone={appDisplayTimeZone}
                variant="tile"
              />
              {hasHintRow ? (
                <div className="flex shrink-0 flex-wrap items-start justify-end gap-0.5">
                  {hasDescription ? (
                    <ProgramTileHintButton
                      ariaLabel="Описание"
                      icon={<NotebookText className="size-4 shrink-0" aria-hidden />}
                    >
                      {descRaw.markdown?.trim() ? (
                        <MarkdownContent
                          text={descRaw.markdown.trim()}
                          bodyFormat="markdown"
                          className="markdown-preview text-[var(--patient-text-primary)] [&_p]:my-1 [&_p]:text-xs [&_p]:leading-relaxed"
                        />
                      ) : (
                        <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed">{descRaw.plain}</p>
                      )}
                    </ProgramTileHintButton>
                  ) : null}
                  {contrText ? (
                    <ProgramTileHintButton
                      ariaLabel="Противопоказания"
                      icon={<AlertTriangle className="size-4 shrink-0" aria-hidden />}
                    >
                      <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed">{contrText}</p>
                    </ProgramTileHintButton>
                  ) : null}
                  {doctorComment ? (
                    <ProgramTileHintButton
                      ariaLabel="Инструкция от специалиста"
                      icon={<Info className="size-4 shrink-0 text-[#714c2f]" aria-hidden />}
                    >
                      <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed text-[#714c2f]">
                        {doctorComment}
                      </p>
                    </ProgramTileHintButton>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          </div>

          {!readOnlyTile ? (
            <div className="mt-1.5 flex w-full min-w-0 flex-nowrap items-stretch gap-2 border-t border-[var(--patient-border)] pt-2">
              {programCommentsInteraction.visible ? (
                <button
                  type="button"
                  className={cn(
                    patientSecondaryActionClass,
                    "inline-flex min-h-9 max-w-[9.5rem] shrink-0 items-center justify-center gap-1 px-2 py-2.5 text-xs font-medium leading-tight whitespace-nowrap",
                    programCommentsInteraction.enabled
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-60",
                  )}
                  disabled={busy !== null || !programCommentsInteraction.enabled}
                  aria-disabled={!programCommentsInteraction.enabled}
                  onClick={() => {
                    if (!programCommentsInteraction.enabled) return;
                    setError(null);
                    setDiscussionDialogItemId(item.id);
                  }}
                >
                  <span className="leading-tight">Комментарии</span>
                  {discussionCount > 0 ? (
                    <span className="rounded-md border border-[#60a5fa]/70 bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#1d4ed8]">
                      {discussionCount}
                    </span>
                  ) : null}
                  {hasDiscussionDot ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-[#ef4444]" aria-label="Есть непрочитанные комментарии" />
                  ) : null}
                </button>
              ) : null}
              {showSimpleCompleteFooter ? (
                <PatientProgramTileSimpleCompleteButton
                  itemId={item.id}
                  completedAt={item.completedAt}
                  lastDoneAtIso={lastDoneAtIsoByItemId[item.id]}
                  busy={busy}
                  planItemDoneRepeatCooldownMs={planItemDoneRepeatCooldownMs}
                  onComplete={handleTileComplete}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {activeMetricsItemId === item.id ? (
          <CompletionMetricsPanel
            draft={metricsDraft}
            onDraftChange={setMetricsDraft}
            onSave={() => void saveMetrics(item.id)}
          />
        ) : null}
      </li>
    );
  };

  return (
    <section className={cn("flex flex-col gap-5", className)} aria-labelledby="stage-program-heading">
      <h3 id="stage-program-heading" className={patientSectionTitleClass}>
        Программа этапа
      </h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {orderedSegments.map((seg, index) =>
          seg.kind === "item" ? (
            renderTile(seg.item)
          ) : (
            <li
              key={seg.group.id}
              className={cn(
                "list-none",
                index > 0 && "mt-3 border-t border-[var(--patient-border)]/25 pt-3",
              )}
            >
              <p className="text-sm font-semibold text-foreground">{seg.group.title}</p>
              {seg.group.scheduleText?.trim() ? (
                <p className="mt-1 text-[13px] leading-snug text-[#444444]">
                  {seg.group.scheduleText.trim()}
                </p>
              ) : null}
              {seg.group.description?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-snug text-[#1e3a78]">
                  {seg.group.description.trim()}
                </p>
              ) : null}
              <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
                {seg.items.map((item) => renderTile(item))}
              </ul>
            </li>
          ),
        )}
      </ul>

      {discussionDialogItemId ? (
        <ProgramItemDiscussionDialog
          instanceId={instanceId}
          itemId={discussionDialogItemId}
          open
          mediaSubmissionEnabled={
            programMediaInteraction.visible && programMediaInteraction.enabled
          }
          onOpenChange={(open) => {
            if (!open) {
              setDiscussionDialogItemId(null);
              void loadDiscussionSummary();
            }
          }}
          onRead={loadDiscussionSummary}
        />
      ) : null}

    </section>
  );
}
