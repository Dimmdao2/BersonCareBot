"use client";

import Link from "next/link";
import { Building2, Dna, Dumbbell } from "lucide-react";
import type { BookingCity } from "@/modules/booking-catalog/types";
import { publicBookPaths } from "@/shared/publicBook/paths";
import {
  bookingChoiceRowClass,
  bookingChoiceRowIconClass,
  bookingChoiceSectionClass,
} from "@/app/app/patient/booking/new/bookingChoiceStyles";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  cities: BookingCity[];
  catalogError: string | null;
};

export function PublicFormatStepClient({ cities, catalogError }: Props) {
  const sorted = [...cities].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));

  return (
    <div className={bookingChoiceSectionClass}>
      <div className="flex flex-col gap-2">
        <p className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Очный приём</p>
        {catalogError ? <p className="text-sm text-destructive">{catalogError}</p> : null}
        {!catalogError ? (
          <div className="flex flex-col gap-2">
            {sorted.map((c) => (
              <Link
                key={c.id}
                href={`${publicBookPaths.newService}?cityCode=${encodeURIComponent(c.code)}&cityTitle=${encodeURIComponent(c.title)}`}
                prefetch={false}
                className={bookingChoiceRowClass}
              >
                <Building2 className={bookingChoiceRowIconClass} aria-hidden />
                {c.title}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Онлайн</p>
        <Link
          href={`${publicBookPaths.newSlot}?type=online&category=rehab_lfk`}
          prefetch={false}
          className={cn(bookingChoiceRowClass, "text-left")}
        >
          <Dumbbell className={bookingChoiceRowIconClass} aria-hidden />
          Реабилитация онлайн
        </Link>
        <Link
          href={`${publicBookPaths.newSlot}?type=online&category=nutrition`}
          prefetch={false}
          className={cn(bookingChoiceRowClass, "text-left")}
        >
          <Dna className={bookingChoiceRowIconClass} aria-hidden />
          Нутрициология онлайн
        </Link>
      </div>
    </div>
  );
}
