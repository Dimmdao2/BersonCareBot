"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  isInstanceStageItemShownOnPatientProgramSurfaces,
  isPersistentRecommendation,
} from "@/modules/treatment-program/stage-semantics";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import {
  parseRecommendationMediaFromSnapshot,
  pickRecommendationRowPreviewMedia,
  recommendationBodyMdPreviewPlain,
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
  instanceId: string;
  currentWorkingStage: Stage | null;
  stageZeroStages: Stage[];
  itemLinksPlanTab?: PatientPlanTab | null;
}) {
  const { instanceId, currentWorkingStage, stageZeroStages, itemLinksPlanTab = "recommendations" } = props;

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

  const renderRow = (item: Stage["items"][number], nav: "rec-stage" | "rec-zero") => {
    const snap = item.snapshot as Record<string, unknown>;
    const media = pickRecommendationRowPreviewMedia(parseRecommendationMediaFromSnapshot(snap));
    const bodyPreview = recommendationBodyMdPreviewPlain(snap.bodyMd);
    const href = routePaths.patientTreatmentProgramItem(instanceId, item.id, nav, itemLinksPlanTab ?? null);
    return (
      <li key={item.id} className="list-none">
        <Link
          href={href}
          className="flex w-full min-h-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-1 py-1 text-left no-underline lg:gap-2 lg:px-1.5 lg:py-1.5"
        >
          <PatientCatalogMediaStaticThumb
            media={media}
            frameClassName="size-[4.25rem] shrink-0 rounded-md border border-[var(--patient-border)]/60 lg:size-20"
            sizes="(max-width: 1024px) 68px, 80px"
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {rowTitle(snap, item.itemType)}
            </span>
            {bodyPreview ? (
              <span className={cn(patientMutedTextClass, "line-clamp-2 text-xs leading-snug")}>{bodyPreview}</span>
            ) : null}
          </div>
        </Link>
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
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {stagePersistent.map((item) => renderRow(item, "rec-stage"))}
          </ul>
        </section>
      ) : null}

      {generalItems.length > 0 ? (
        <section aria-labelledby="patient-tp-rec-general-heading">
          <h3 id="patient-tp-rec-general-heading" className={patientSectionTitleClass}>
            Общие рекомендации
          </h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {generalItems.map((item) => renderRow(item, "rec-zero"))}
          </ul>
        </section>
      ) : null}

      {stagePersistent.length === 0 && generalItems.length === 0 ? (
        <p className={patientMutedTextClass}>Нет рекомендаций.</p>
      ) : null}
    </div>
  );
}
