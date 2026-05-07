"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { PlayCircle } from "lucide-react";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment/PatientProgramStageItemModal";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownOnPatientProgramSurfaces,
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
  patientCompactActionClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Состав программы этапа: упражнения и «действующие» рекомендации; без test_set (тесты — отдельный поток / модалка). */
function isProgramCompositionItem(item: InstanceStageItem): boolean {
  if (!isInstanceStageItemShownOnPatientProgramSurfaces(item)) return false;
  if (item.itemType === "exercise") return true;
  return item.itemType === "recommendation" && !isPersistentRecommendation(item);
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
  const visibleProgramItems = sortByOrderThenId(stage.items.filter(isProgramCompositionItem));
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

function formatTileCharacteristics(item: InstanceStageItem): string {
  const snap = item.snapshot as Record<string, unknown>;
  const parts: string[] = [];
  if (item.itemType === "exercise") {
    const d = snap.difficulty;
    if (typeof d === "number" && Number.isFinite(d)) parts.push(`Сложность: ${d}/10`);
    else if (typeof d === "string" && d.trim()) parts.push(`Сложность: ${d.trim()}`);
    if (typeof snap.loadType === "string" && snap.loadType.trim()) parts.push(`Нагрузка: ${snap.loadType.trim()}`);
    const reps = typeof snap.reps === "number" && Number.isFinite(snap.reps) ? snap.reps : null;
    const sets = typeof snap.sets === "number" && Number.isFinite(snap.sets) ? snap.sets : null;
    if (sets != null) parts.push(`Подходов: ${sets}`);
    if (reps != null) parts.push(`Повторений: ${reps}`);
  }
  if (item.itemType === "recommendation") {
    if (typeof snap.quantityText === "string" && snap.quantityText.trim()) parts.push(snap.quantityText.trim());
    if (typeof snap.frequencyText === "string" && snap.frequencyText.trim()) parts.push(snap.frequencyText.trim());
    if (typeof snap.durationText === "string" && snap.durationText.trim()) parts.push(snap.durationText.trim());
  }
  return parts.join(" · ");
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
    () => sortByOrderThenId(stage.items.filter(isProgramCompositionItem)),
    [stage.items],
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

  const renderTile = (item: InstanceStageItem): ReactNode => {
    const media = primaryMediaForStageItem(item);
    const isVideo = media?.mediaType === "video";
    const metricsLine = formatTileCharacteristics(item);
    const n = totalCompletionEventsByItemId[item.id] ?? 0;
    const lastIso = mergeLastActivityDisplayedIso(lastDoneAtIsoByItemId[item.id], item.completedAt);
    const showActivityLine = n > 0 || Boolean(lastIso);
    const readOnlyTile = readOnly || contentBlocked;

    return (
      <li
        key={item.id}
        className={cn(
          patientCardClass,
          "list-none overflow-hidden p-0 shadow-sm",
        )}
      >
        <button
          type="button"
          className={cn(
            "relative block w-full overflow-hidden border-0 p-0 text-left",
            "rounded-t-[var(--patient-card-radius-mobile)] lg:rounded-t-[var(--patient-card-radius-desktop)]",
          )}
          onClick={() => openProgramModal(item.id)}
        >
          <div className="relative aspect-video w-full bg-muted/20">
            <PatientCatalogMediaStaticThumb
              media={media}
              frameClassName="h-full w-full rounded-none"
              sizes="100vw"
            />
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
              aria-hidden
            >
              {isVideo ? (
                <PlayCircle className="size-12 text-white drop-shadow-md" />
              ) : (
                <span className="rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white">Открыть</span>
              )}
            </div>
          </div>
        </button>
        <div className="space-y-2 px-3 py-3">
          <p className="text-sm font-medium text-foreground">{tileTitle(item.snapshot as Record<string, unknown>, item.itemType)}</p>
          {metricsLine ? <p className={cn(patientMutedTextClass, "text-xs")}>{metricsLine}</p> : null}
          {showActivityLine ? (
            <p className={cn(patientMutedTextClass, "text-xs leading-snug")}>
              {n > 0 ? (
                <>
                  Выполнялось {n} {ruDoneTimesWord(n)}.
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(patientCompactActionClass, "h-8 px-2 text-xs")}
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
              <button
                type="button"
                className={cn(patientCompactActionClass, "h-8 px-2 text-xs")}
                disabled={busy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  openProgramModal(item.id);
                }}
              >
                Добавить комментарий
              </button>
            </div>
          ) : null}
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
