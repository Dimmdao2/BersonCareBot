"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { DoctorClientProgramCardAggregates } from "@/modules/doctor-client-card/types";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileListScope?: string;
  instances: TreatmentProgramInstanceSummary[] | undefined;
  aggregates: DoctorClientProgramCardAggregates;
  assignEnabled: boolean;
  onAssignClick: () => void;
};

export function DoctorClientOverviewCarePlan({
  userId,
  profileListScope,
  instances,
  aggregates,
  assignEnabled,
  onAssignClick,
}: Props) {
  const scopeQs = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const active = instances ? pickActivePlanInstance(instances) : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Программа реабилитации</h3>
        {aggregates.planNotOpened ? (
          <Badge variant="outline" className="text-xs">
            План не открыт
          </Badge>
        ) : null}
      </div>
      {active ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{active.title}</p>
          <Link
            href={`/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(active.id)}${scopeQs}`}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-fit")}
          >
            Открыть программу
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Нет активной программы</p>
          {assignEnabled ? (
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
              onClick={onAssignClick}
            >
              Назначить программу
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
