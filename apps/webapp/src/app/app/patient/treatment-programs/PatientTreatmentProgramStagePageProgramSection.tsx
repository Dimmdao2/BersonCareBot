"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment-programs/PatientProgramStageItemModal";
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
} from "@/app/app/patient/treatment-programs/stageItemSnapshot";
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

function isProgramCompositionItem(item: InstanceStageItem): boolean {
  if (!isInstanceStageItemShownOnPatientProgramSurfaces(item)) return false;
  if (item.itemType === "exercise") return true;
  return item.itemType === "recommendation" && !isPersistentRecommendation(item);
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

  const sortedGroups = useMemo(
    () =>
      sortByOrderThenId(stage.groups).filter((g) =>
        visibleProgramItems.some((it) => it.groupId === g.id),
      ),
    [stage.groups, visibleProgramItems],
  );

  const ungroupedItems = useMemo(
    () => sortByOrderThenId(visibleProgramItems.filter((it) => !it.groupId)),
    [visibleProgramItems],
  );

  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const flatOrderedProgramIds = useMemo(() => {
    const ids: string[] = [];
    for (const it of ungroupedItems) ids.push(it.id);
    for (const g of sortedGroups) {
      const gItems = sortByOrderThenId(visibleProgramItems.filter((x) => x.groupId === g.id));
      for (const it of gItems) ids.push(it.id);
    }
    return ids;
  }, [ungroupedItems, sortedGroups, visibleProgramItems]);

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
          className="relative block w-full overflow-hidden rounded-t-lg border-0 p-0 text-left"
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
        {ungroupedItems.map((item) => renderTile(item))}
        {sortedGroups.map((g) => {
          const gItems = sortByOrderThenId(visibleProgramItems.filter((it) => it.groupId === g.id));
          return (
            <li key={g.id} className="list-none">
              <p className="text-sm font-semibold text-foreground">{g.title}</p>
              {g.scheduleText?.trim() ? (
                <p className={cn(patientMutedTextClass, "mt-1 text-xs")}>{g.scheduleText.trim()}</p>
              ) : null}
              {g.description?.trim() ? (
                <p className={cn(patientBodyTextClass, "mt-2 whitespace-pre-wrap text-sm")}>{g.description.trim()}</p>
              ) : null}
              <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">{gItems.map((item) => renderTile(item))}</ul>
            </li>
          );
        })}
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
