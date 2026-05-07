"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Shield } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PatientProgramStageItemModal } from "@/app/app/patient/treatment-programs/PatientProgramStageItemModal";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { isPersistentRecommendation } from "@/modules/treatment-program/stage-semantics";
import {
  parseRecommendationMediaFromSnapshot,
  pickRecommendationRowPreviewMedia,
} from "@/app/app/patient/treatment-programs/stageItemSnapshot";
import {
  patientCardListSectionClass,
  patientRecommendationCollapsiblePanelClass,
  patientRecommendationCollapsibleTriggerClass,
  patientSectionTitleClass,
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

export function PatientTreatmentProgramStageRecommendationsCollapsible(props: {
  stage: Stage;
  base: string;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
  refresh: () => Promise<void>;
  contentBlocked: boolean;
}) {
  const { stage, base, busy, setBusy, setError, refresh, contentBlocked } = props;
  const persistent = useMemo(
    () => sortByOrderThenId(stage.items.filter((it) => isPersistentRecommendation(it))),
    [stage.items],
  );
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const flatIds = useMemo(() => persistent.map((i) => i.id), [persistent]);
  const openItem = useMemo(
    () => (openItemId ? (persistent.find((i) => i.id === openItemId) ?? null) : null),
    [openItemId, persistent],
  );

  if (persistent.length === 0) return null;

  return (
    <>
      <Collapsible className={cn(patientCardListSectionClass, "overflow-hidden p-0 lg:p-0")}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center px-3 py-4 text-left lg:px-4 lg:py-[18px]",
            patientRecommendationCollapsibleTriggerClass,
          )}
        >
          <div className="mb-0 flex min-w-0 w-full items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Shield className="size-4 shrink-0 text-emerald-800/85" aria-hidden />
              <span className={patientSectionTitleClass}>Рекомендации этапа</span>
            </div>
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-data-[open]/collapsible:rotate-180"
              aria-hidden
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn("border-t border-[var(--patient-border)]", patientRecommendationCollapsiblePanelClass)}
        >
          <ul className="m-0 list-none divide-y divide-[var(--patient-border)]/40 p-0">
            {persistent.map((item) => {
              const media = pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(item.snapshot));
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left lg:px-4"
                    onClick={() => setOpenItemId(item.id)}
                  >
                    <PatientCatalogMediaStaticThumb
                      media={media}
                      frameClassName="size-12 shrink-0 rounded-md border border-[var(--patient-border)]/60"
                      sizes="48px"
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                      {rowTitle(item.snapshot as Record<string, unknown>, item.itemType)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <PatientProgramStageItemModal
        stage={stage}
        base={base}
        item={openItem}
        flatOrderedIds={flatIds}
        onClose={() => setOpenItemId(null)}
        onNavigate={(id) => setOpenItemId(id)}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
        refresh={refresh}
        itemInteraction="readOnly"
        doneItemIds={[]}
        onDoneItemIds={() => {}}
        contentBlocked={contentBlocked}
      />
    </>
  );
}
