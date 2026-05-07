"use client";

import { useMemo, useState } from "react";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment/PatientProgramStageItemModal";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
} from "@/modules/treatment-program/stage-semantics";
import {
  parseRecommendationMediaFromSnapshot,
  pickRecommendationRowPreviewMedia,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import {
  patientMutedTextClass,
  patientSectionTitleClass,
  patientInnerPageStackClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function rowTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return itemType;
}

export function PatientTreatmentTabRecommendations(props: {
  currentWorkingStage: Stage | null;
  stageZeroStages: Stage[];
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const { currentWorkingStage, stageZeroStages, base, busy, setBusy, setError, refresh } = props;
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const stagePersistent = useMemo(
    () =>
      currentWorkingStage
        ? sortByOrderThenId(currentWorkingStage.items.filter((it) => isPersistentRecommendation(it)))
        : [],
    [currentWorkingStage],
  );

  const generalItems = useMemo(() => {
    const rows: Stage["items"] = [];
    for (const st of stageZeroStages) {
      for (const it of sortByOrderThenId(st.items)) {
        if (isInstanceStageItemShownOnPatientProgramSurfaces(it)) rows.push(it);
      }
    }
    return rows;
  }, [stageZeroStages]);

  const flatIdsForModal = useMemo(() => {
    if (!openItemId) return [];
    if (stagePersistent.some((i) => i.id === openItemId)) return stagePersistent.map((i) => i.id);
    return generalItems.map((i) => i.id);
  }, [openItemId, stagePersistent, generalItems]);

  const openItem = useMemo(() => {
    if (!openItemId) return null;
    const fromStage = stagePersistent.find((i) => i.id === openItemId);
    if (fromStage) return fromStage;
    return generalItems.find((i) => i.id === openItemId) ?? null;
  }, [openItemId, stagePersistent, generalItems]);

  const openStageForModal = useMemo(() => {
    if (!openItemId) return null;
    if (currentWorkingStage?.items.some((i) => i.id === openItemId)) return currentWorkingStage;
    for (const st of stageZeroStages) {
      if (st.items.some((i) => i.id === openItemId)) return st;
    }
    return currentWorkingStage;
  }, [openItemId, currentWorkingStage, stageZeroStages]);

  const renderRow = (item: Stage["items"][number]) => {
    const media = pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(item.snapshot));
    return (
      <li key={item.id} className="list-none">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-3 py-3 text-left lg:gap-4 lg:px-4 lg:py-4"
          onClick={() => setOpenItemId(item.id)}
        >
          <PatientCatalogMediaStaticThumb
            media={media}
            frameClassName="size-14 shrink-0 rounded-md border border-[var(--patient-border)]/60 lg:size-16"
            sizes="64px"
          />
          <span className="min-w-0 flex-1 text-base font-semibold text-foreground lg:text-lg">
            {rowTitle(item.snapshot as Record<string, unknown>, item.itemType)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className={cn(patientInnerPageStackClass, "gap-4")}>
      {stagePersistent.length > 0 ? (
        <section aria-labelledby="patient-tp-rec-stage-heading">
          <h3 id="patient-tp-rec-stage-heading" className={patientSectionTitleClass}>
            Рекомендации этапа
          </h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">{stagePersistent.map((item) => renderRow(item))}</ul>
        </section>
      ) : null}

      {generalItems.length > 0 ? (
        <section aria-labelledby="patient-tp-rec-general-heading">
          <h3 id="patient-tp-rec-general-heading" className={patientSectionTitleClass}>
            Общие
          </h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">{generalItems.map((item) => renderRow(item))}</ul>
        </section>
      ) : null}

      {stagePersistent.length === 0 && generalItems.length === 0 ? (
        <p className={patientMutedTextClass}>Нет рекомендаций.</p>
      ) : null}

      {openItemId && openStageForModal ? (
        <PatientProgramStageItemModal
          stage={openStageForModal}
          base={base}
          item={openItem}
          flatOrderedIds={flatIdsForModal}
          onClose={() => setOpenItemId(null)}
          onNavigate={(id) => setOpenItemId(id)}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          refresh={refresh}
          itemInteraction="readOnly"
          doneItemIds={[]}
          onDoneItemIds={() => {}}
          contentBlocked={false}
        />
      ) : null}
    </div>
  );
}
