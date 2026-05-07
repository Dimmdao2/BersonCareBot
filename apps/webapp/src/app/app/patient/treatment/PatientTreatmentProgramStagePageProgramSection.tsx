"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, MessageCircle, NotebookText, PlayCircle } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  formatRelativePatientCalendarDayRu,
  isPersistentRecommendation,
} from "@/modules/treatment-program/stage-semantics";
import {
  mergeLastActivityDisplayedIso,
  primaryMediaForStageItem,
  recommendationBodyMdPreviewPlain,
  type InstanceStageItem,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  patientBodyTextClass,
  patientCardClass,
  patientCompactActionClass,
  patientMutedTextClass,
  patientSecondaryActionClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { cn } from "@/lib/utils";
import {
  buildProgramCompositionSegments,
  isProgramCompositionItem,
  sortProgramCompositionItemsByOrderThenId,
} from "@/app/app/patient/treatment/programCompositionOrder";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

/** Кнопка `progress/complete` на плитке — только для типов, которые реально поддерживают simple complete. */
function programTileShowsSimpleCompleteActions(item: InstanceStageItem): boolean {
  if (isPersistentRecommendation(item)) return false;
  if (item.itemType === "lfk_complex") return false;
  if (item.itemType === "test_set") return false;
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
        className="max-h-[min(50vh,22rem)] w-[min(calc(100vw-2rem),20rem)] overflow-y-auto p-3 text-xs leading-relaxed text-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Как в модалке «Состав этапа» (`PatientTreatmentProgramDetailClient` — `MAX_COMPOSITION_TODAY_DOTS`). */
const MAX_TODAY_DOTS = 24;

function PatientProgramTileTodayDots(props: { todayCount: number }) {
  const { todayCount } = props;
  const dotCount = Math.min(todayCount, MAX_TODAY_DOTS);
  const dotOverflow = todayCount > MAX_TODAY_DOTS ? todayCount - MAX_TODAY_DOTS : 0;
  return (
    <div
      className="flex min-h-[10px] shrink-0 flex-wrap items-center justify-start gap-0.5"
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
  } = props;

  const readOnly = itemInteraction === "readOnly";
  const visibleProgramItems = useMemo(
    () => sortProgramCompositionItemsByOrderThenId(stage.items.filter((it) => isProgramCompositionItem(it, stage))),
    [stage],
  );

  const orderedSegments = useMemo(
    () => buildProgramCompositionSegments(stage, visibleProgramItems),
    [stage, visibleProgramItems],
  );

  if (visibleProgramItems.length === 0) return null;

  const itemProgramHref = (itemId: string) =>
    routePaths.patientTreatmentProgramItem(instanceId, itemId, "program");

  const renderTile = (item: InstanceStageItem): ReactNode => {
    const media = primaryMediaForStageItem(item);
    const isVideo = media?.mediaType === "video";
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
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
                aria-hidden
              >
                {isVideo ? (
                  <PlayCircle className="size-8 text-white/45 drop-shadow-md" />
                ) : (
                  <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Открыть
                  </span>
                )}
              </div>
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
              <div className="flex min-w-0 flex-1 flex-col gap-0">
                <p className={cn(patientMutedTextClass, "text-xs leading-tight")}>Выполнялось</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn(patientMutedTextClass, "shrink-0 text-xs leading-tight")}>
                    {lastIso ? formatRelativePatientCalendarDayRu(lastIso, appDisplayTimeZone) : "Никогда"}
                  </p>
                  <PatientProgramTileTodayDots todayCount={todayCount} />
                </div>
              </div>
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
                      ariaLabel="Комментарий врача"
                      icon={<MessageCircle className="size-4 shrink-0" aria-hidden />}
                    >
                      <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed">{doctorComment}</p>
                    </ProgramTileHintButton>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          </div>

          {!readOnlyTile ? (
            <div className="mt-1.5 flex w-full min-w-0 gap-2 border-t border-[var(--patient-border)] pt-2">
              <Link
                href={itemProgramHref(item.id)}
                className={cn(
                  patientSecondaryActionClass,
                  "!w-auto h-8 min-h-0 min-w-0 flex-1 basis-0 text-xs font-medium",
                  "inline-flex items-center justify-center gap-1.5 no-underline",
                )}
              >
                Добавить комментарий
              </Link>
              {showSimpleCompleteFooter ? (
                <button
                  type="button"
                  className={cn(patientCompactActionClass, "min-h-0 min-w-0 flex-1 basis-0 px-2 text-xs font-medium")}
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
                      if (!res.ok || !data?.ok) {
                        setError(data?.error ?? "Ошибка");
                        return;
                      }
                      await refresh();
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {item.completedAt ? "Отметить ещё раз" : "Отметить выполнение"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
    </section>
  );
}
