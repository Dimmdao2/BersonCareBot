"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  primaryMediaForStageItem,
  primaryMediaForTestSnapshotLine,
  recommendationBodyMdPreviewPlain,
} from "@/app/app/patient/treatment/stageItemSnapshot";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { TreatmentProgramItemType } from "@/modules/treatment-program/types";
import type { DoctorClientOverviewCarePlanModel } from "@/modules/doctor-client-card/types";
import type { DoctorClientProgramCardAggregates } from "@/modules/doctor-client-card/types";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import {
  doctorClientInsetListRowClass,
  doctorClientOverviewCardClass,
  doctorClientSectionTitleClass,
} from "./doctorClientCardChrome";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileListScope?: string;
  instances?: TreatmentProgramInstanceSummary[];
  carePlan: DoctorClientOverviewCarePlanModel | null;
  aggregates: DoctorClientProgramCardAggregates;
  assignEnabled: boolean;
  onAssignClick: () => void;
};

function carePlanItemPreview(item: DoctorClientOverviewCarePlanModel["items"][number]) {
  if (item.itemType === "clinical_test") {
    const fromTest = primaryMediaForTestSnapshotLine(item.snapshot, item.itemRefId);
    if (fromTest) return fromTest;
  }
  return primaryMediaForStageItem({
    id: item.id,
    stageId: "",
    itemType: item.itemType as TreatmentProgramItemType,
    itemRefId: item.itemRefId,
    sortOrder: 0,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: item.snapshot,
    completedAt: null,
    isActionable: null,
    status: "active",
    groupId: null,
    createdAt: "",
    lastViewedAt: null,
    effectiveComment: null,
  });
}

function mdPreviewLine(text: string | null): string | null {
  if (!text?.trim()) return null;
  const plain = recommendationBodyMdPreviewPlain(text);
  return plain || text.trim();
}

export function DoctorClientOverviewCarePlan({
  userId,
  profileListScope,
  instances,
  carePlan,
  aggregates,
  assignEnabled,
  onAssignClick,
}: Props) {
  const scopeQs = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const activeFallback = instances ? pickActivePlanInstance(instances) : null;
  const instanceId = carePlan?.instanceId ?? activeFallback?.id ?? null;
  const instanceHref = instanceId
    ? `/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(instanceId)}${scopeQs}`
    : null;

  const goalsLine = carePlan ? mdPreviewLine(carePlan.goals) : null;
  const objectivesLine = carePlan ? mdPreviewLine(carePlan.objectives) : null;
  const stageProgressPct =
    carePlan && carePlan.totalStages > 0
      ? Math.round((carePlan.completedStages / carePlan.totalStages) * 100)
      : 0;

  return (
    <section className={doctorClientOverviewCardClass}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className={doctorClientSectionTitleClass}>Программа реабилитации</h3>
        {aggregates.planNotOpened ? (
          <Badge variant="outline" className="text-xs">
            План не открыт
          </Badge>
        ) : null}
      </div>
      {carePlan ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-sm font-medium leading-snug">{carePlan.instanceTitle}</p>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{carePlan.stageTitle}</p>
            {carePlan.totalStages > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Этапы</span>
                  <span className="tabular-nums">
                    {carePlan.completedStages} / {carePlan.totalStages}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={stageProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${stageProgressPct}%` }}
                  />
                </div>
              </div>
            ) : null}
            {goalsLine ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{goalsLine}</p>
            ) : null}
            {objectivesLine ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{objectivesLine}</p>
            ) : null}
            {carePlan.expectedDurationText?.trim() ? (
              <p className="text-xs text-muted-foreground">{carePlan.expectedDurationText.trim()}</p>
            ) : null}
          </div>
          {carePlan.items.length > 0 ? (
            <ul className="m-0 list-none space-y-1.5 p-0">
              {carePlan.items.map((item) => {
                const media = carePlanItemPreview(item);
                const rowHref = instanceHref;
                return (
                  <li key={item.id}>
                    {rowHref ? (
                      <Link href={rowHref} className={cn(doctorClientInsetListRowClass, "group")}>
                        <PatientCatalogMediaStaticThumb
                          media={media}
                          frameClassName="size-11 shrink-0 rounded-md border border-border"
                          sizes="44px"
                          iconClassName="size-4"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                        {item.isNew ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Новое
                          </Badge>
                        ) : null}
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </Link>
                    ) : (
                      <div className={doctorClientInsetListRowClass}>
                        <PatientCatalogMediaStaticThumb
                          media={media}
                          frameClassName="size-11 shrink-0 rounded-md border border-border"
                          sizes="44px"
                          iconClassName="size-4"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                        {item.isNew ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Новое
                          </Badge>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {instanceHref ? (
            <Link
              href={instanceHref}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-auto w-fit")}
            >
              Открыть программу
            </Link>
          ) : null}
        </div>
      ) : activeFallback && instanceHref ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{activeFallback.title}</p>
          <Link
            href={instanceHref}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-fit")}
          >
            Открыть программу
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Нет активной программы</p>
          {assignEnabled ? (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onAssignClick}>
              Назначить программу
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
