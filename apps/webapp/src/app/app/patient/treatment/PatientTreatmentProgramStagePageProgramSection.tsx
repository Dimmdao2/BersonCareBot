"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment/PatientProgramStageItemModal";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownInPatientCompositionModal,
  isPersistentRecommendation,
} from "@/modules/treatment-program/stage-semantics";
import {
  mergeLastActivityDisplayedIso,
  formatRelativeTimeRu,
  primaryMediaForStageItem,
  type InstanceStageItem,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  patientBodyTextClass,
  patientCardClass,
  patientMutedTextClass,
  patientSecondaryActionClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * Состав «Программа этапа» — тот же набор, что модалка «Состав этапа» на прогрессе
 * ({@link isInstanceStageItemShownInPatientCompositionModal}): без `test_set`.
 */
function isProgramCompositionItem(item: InstanceStageItem, stage: Stage): boolean {
  return isInstanceStageItemShownInPatientCompositionModal(item, stage.groups);
}

/** Кнопка `progress/complete` на плитке — только для типов, которые реально поддерживают simple complete. */
function programTileShowsSimpleCompleteActions(item: InstanceStageItem): boolean {
  if (isPersistentRecommendation(item)) return false;
  if (item.itemType === "lfk_complex") return false;
  if (item.itemType === "test_set") return false;
  return true;
}

type ProgramCompositionSegment =
  | { kind: "item"; item: InstanceStageItem }
  | { kind: "group"; group: Stage["groups"][number]; items: InstanceStageItem[] };

/**
 * Порядок блоков как в шаблоне: по `sort_order` элементов группа участвует на позиции минимального
 * `sort_order` среди своих пунктов (не «все без группы сверху, потом все группы»).
 */
function buildProgramCompositionSegments(
  stage: Stage,
  visibleProgramItems: InstanceStageItem[],
): ProgramCompositionSegment[] {
  const sortedItems = sortByOrderThenId(visibleProgramItems);
  const usedGroupIds = new Set<string>();
  for (const it of sortedItems) {
    if (it.groupId) usedGroupIds.add(it.groupId);
  }
  const groupsById = new Map(stage.groups.map((g) => [g.id, g] as const));

  const keyed: Array<{ sortKey: number; tie: string; segment: ProgramCompositionSegment }> = [];

  for (const it of sortedItems) {
    if (!it.groupId) {
      keyed.push({ sortKey: it.sortOrder, tie: it.id, segment: { kind: "item", item: it } });
    }
  }
  for (const gid of usedGroupIds) {
    const g = groupsById.get(gid);
    if (!g) continue;
    const gItems = sortByOrderThenId(sortedItems.filter((x) => x.groupId === gid));
    if (gItems.length === 0) continue;
    const minOrder = Math.min(...gItems.map((x) => x.sortOrder));
    keyed.push({ sortKey: minOrder, tie: gid, segment: { kind: "group", group: g, items: gItems } });
  }

  keyed.sort((a, b) => a.sortKey - b.sortKey || a.tie.localeCompare(b.tie));
  return keyed.map((k) => k.segment);
}

/** Порядок id элементов «программы этапа» (как в {@link PatientTreatmentProgramStagePageProgramSection}). */
export function flatOrderedProgramCompositionItemIds(stage: Stage): string[] {
  const visibleProgramItems = sortByOrderThenId(stage.items.filter((it) => isProgramCompositionItem(it, stage)));
  const segments = buildProgramCompositionSegments(stage, visibleProgramItems);
  const ids: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "item") ids.push(seg.item.id);
    else for (const it of seg.items) ids.push(it.id);
  }
  return ids;
}

function tileTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

function ruDoneTimesWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "раз";
  const mod10 = n % 10;
  if (mod10 === 1) return "раз";
  if (mod10 >= 2 && mod10 <= 4) return "раза";
  return "раз";
}

export function PatientTreatmentProgramStagePageProgramSection(props: {
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
  totalCompletionEventsByItemId: Readonly<Record<string, number>>;
  appDisplayTimeZone: string;
}) {
  const {
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
    totalCompletionEventsByItemId,
    appDisplayTimeZone,
  } = props;

  const readOnly = itemInteraction === "readOnly";
  const visibleProgramItems = useMemo(
    () => sortByOrderThenId(stage.items.filter((it) => isProgramCompositionItem(it, stage))),
    [stage],
  );

  const orderedSegments = useMemo(
    () => buildProgramCompositionSegments(stage, visibleProgramItems),
    [stage, visibleProgramItems],
  );

  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const flatOrderedProgramIds = useMemo(
    () => flatOrderedProgramCompositionItemIds(stage),
    [stage],
  );

  const openModalItem = useMemo(
    () => (openItemId ? (visibleProgramItems.find((it) => it.id === openItemId) ?? null) : null),
    [openItemId, visibleProgramItems],
  );

  const openProgramModal = useCallback((id: string) => {
    setOpenItemId(id);
  }, []);

  const closeModal = useCallback(() => {
    setOpenItemId(null);
  }, []);

  const navigateModal = useCallback((id: string) => {
    setOpenItemId(id);
  }, []);

  if (visibleProgramItems.length === 0) return null;

  const programTileActionButtonClass = cn(
    patientSecondaryActionClass,
    "h-8 min-h-0 text-xs font-medium",
  );

  const renderTile = (item: InstanceStageItem): ReactNode => {
    const media = primaryMediaForStageItem(item);
    const instructions = item.effectiveComment?.trim() ?? "";
    const n = totalCompletionEventsByItemId[item.id] ?? 0;
    const lastIso = mergeLastActivityDisplayedIso(lastDoneAtIsoByItemId[item.id], item.completedAt);
    const showActivityLine = n > 0 || Boolean(lastIso);
    const readOnlyTile = readOnly || contentBlocked;
    const showSimpleCompleteFooter = !readOnlyTile && programTileShowsSimpleCompleteActions(item);

    return (
      <li
        key={item.id}
        className={cn(
          patientCardClass,
          "list-none overflow-hidden p-0 shadow-sm",
        )}
      >
        <div className="flex gap-3 p-3">
          <button
            type="button"
            className={cn(
              "relative size-[72px] shrink-0 cursor-pointer overflow-hidden rounded-md border-0 bg-muted/20 p-0 text-left",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
            )}
            onClick={() => openProgramModal(item.id)}
            aria-label={`Открыть: ${tileTitle(item.snapshot as Record<string, unknown>, item.itemType)}`}
          >
            <PatientCatalogMediaStaticThumb
              media={media}
              frameClassName="h-full w-full rounded-none"
              sizes="72px"
            />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-0">
            <button
              type="button"
              className="w-full cursor-pointer border-0 bg-transparent p-0 text-left"
              onClick={() => openProgramModal(item.id)}
            >
              <span className="text-sm font-medium text-foreground">
                {tileTitle(item.snapshot as Record<string, unknown>, item.itemType)}
              </span>
            </button>

            {instructions ? (
              <>
                <div className="my-2 border-t border-[var(--patient-border)]" role="presentation" />
                <p className={cn(patientBodyTextClass, "whitespace-pre-wrap text-xs leading-snug")}>{instructions}</p>
              </>
            ) : null}

            <div className="my-2 border-t border-[var(--patient-border)]" role="presentation" />
            <p className={cn(patientMutedTextClass, "text-xs font-semibold text-muted-foreground")}>Выполнялось</p>
            {showActivityLine ? (
              <p className={cn(patientMutedTextClass, "mt-0.5 text-xs leading-snug")}>
                {n > 0 ? (
                  <>
                    {n} {ruDoneTimesWord(n)}.
                  </>
                ) : null}
                {lastIso ? (
                  <>
                    {n > 0 ? " " : null}
                    Последнее: {formatRelativeTimeRu(lastIso, appDisplayTimeZone)}
                  </>
                ) : null}
              </p>
            ) : null}

            {!readOnlyTile ? (
              <>
                <div className="my-2 border-t border-[var(--patient-border)]" role="presentation" />
                <div className="flex w-full max-w-full flex-col gap-2">
                  {showSimpleCompleteFooter ? (
                    <button
                      type="button"
                      className={programTileActionButtonClass}
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
                  <button
                    type="button"
                    className={programTileActionButtonClass}
                    disabled={busy !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      openProgramModal(item.id);
                    }}
                  >
                    Добавить комментарий
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="stage-program-heading">
      <h3 id="stage-program-heading" className={patientSectionTitleClass}>
        Программа этапа
      </h3>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {orderedSegments.map((seg) =>
          seg.kind === "item" ? (
            renderTile(seg.item)
          ) : (
            <li key={seg.group.id} className="list-none">
              <p className="text-sm font-semibold text-foreground">{seg.group.title}</p>
              {seg.group.scheduleText?.trim() ? (
                <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>{seg.group.scheduleText.trim()}</p>
              ) : null}
              {seg.group.description?.trim() ? (
                <p className={cn(patientBodyTextClass, "mt-2 whitespace-pre-wrap text-sm")}>
                  {seg.group.description.trim()}
                </p>
              ) : null}
              <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
                {seg.items.map((item) => renderTile(item))}
              </ul>
            </li>
          ),
        )}
      </ul>

      {openItemId ? (
        <PatientProgramStageItemModal
          stage={stage}
          base={base}
          item={openModalItem}
          flatOrderedIds={flatOrderedProgramIds}
          onClose={closeModal}
          onNavigate={navigateModal}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          itemInteraction={readOnly ? "readOnly" : "full"}
          doneItemIds={doneItemIds}
          onDoneItemIds={onDoneItemIds}
          contentBlocked={contentBlocked}
        />
      ) : null}
    </section>
  );
}
