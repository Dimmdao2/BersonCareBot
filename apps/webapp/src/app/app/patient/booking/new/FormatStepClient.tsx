"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Dna, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCity } from "@/modules/booking-catalog/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import {
  bookingChoiceRowClass,
  bookingChoiceRowIconClass,
  bookingChoiceSectionClass,
} from "./bookingChoiceStyles";

function sortCitiesForDisplay(cities: BookingCity[]): BookingCity[] {
  return [...cities].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"),
  );
}

export type FormatStepClientProps = {
  cities: BookingCity[];
  /** Ошибка загрузки каталога на сервере; `null` если данные пришли успешно (включая пустой список). */
  catalogError: string | null;
};

export function FormatStepClient({ cities, catalogError }: FormatStepClientProps) {
  const router = useRouter();
  const sortedCities = sortCitiesForDisplay(cities);

  return (
    <div className={bookingChoiceSectionClass}>
      <div className="flex flex-col gap-2">
        <p className={cn(patientMutedTextClass, "text-xs font-medium uppercase tracking-wide")}>Очный приём</p>
        {catalogError ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{catalogError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              Повторить
            </Button>
          </div>
        ) : null}
        {!catalogError ? (
          <div className="flex flex-col gap-2">
            {sortedCities.map((c) => (
              <Link
                key={c.id}
                href={`${routePaths.bookingNewService}?cityCode=${encodeURIComponent(c.code)}&cityTitle=${encodeURIComponent(c.title)}`}
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
        <button
          type="button"
          className={cn(bookingChoiceRowClass, "text-left")}
          onClick={() => router.push(routePaths.intakeLfk)}
        >
          <Dumbbell className={bookingChoiceRowIconClass} aria-hidden />
          Реабилитация онлайн
        </button>
        <button
          type="button"
          className={cn(bookingChoiceRowClass, "text-left")}
          onClick={() => router.push(routePaths.intakeNutrition)}
        >
          <Dna className={bookingChoiceRowIconClass} aria-hidden />
          Нутрициология онлайн
        </button>
      </div>
    </div>
  );
}
