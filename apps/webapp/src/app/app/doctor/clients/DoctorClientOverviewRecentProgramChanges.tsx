"use client";

import Link from "next/link";
import { formatBookingDateTimeShortStyleRu } from "@/shared/lib/formatBusinessDateTime";
import { doctorClientOverviewPrimaryCardClass, doctorClientSectionTitleClass } from "./doctorClientCardChrome";
import type { DoctorClientRecentProgramChangeRow } from "@/modules/doctor-client-card/types";

type Props = {
  patientUserId: string;
  instanceId: string;
  profileListScope?: string;
  rows: DoctorClientRecentProgramChangeRow[];
  displayTimeZone: string;
};

export function DoctorClientOverviewRecentProgramChanges({
  patientUserId,
  instanceId,
  profileListScope,
  rows,
  displayTimeZone,
}: Props) {
  if (rows.length === 0) return null;

  const scopeQ = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const href = `/app/doctor/clients/${encodeURIComponent(patientUserId)}/treatment-programs/${encodeURIComponent(instanceId)}${scopeQ}`;

  return (
    <section className={doctorClientOverviewPrimaryCardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={doctorClientSectionTitleClass}>Изменения программы</h3>
        <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
          Открыть программу
        </Link>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
            <span className="text-xs text-muted-foreground">
              {formatBookingDateTimeShortStyleRu(row.createdAt, displayTimeZone)}
            </span>
            <span className="ml-2">{row.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
