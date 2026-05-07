"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCity } from "@/modules/booking-catalog/types";
import { patientInfoLinkTileClass, patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

function sortCitiesForDisplay(cities: BookingCity[]): BookingCity[] {
  return [...cities].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"),
  );
}

export type CityStepClientProps = {
  cities: BookingCity[];
  catalogError: string | null;
};

export function CityStepClient({ cities, catalogError }: CityStepClientProps) {
  const router = useRouter();
  const sorted = sortCitiesForDisplay(cities);

  return (
    <div className={patientSectionSurfaceClass}>
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
          {sorted.map((c) => (
            <button
              key={c.id}
              type="button"
              className={patientInfoLinkTileClass}
              onClick={() =>
                router.push(
                  `${routePaths.bookingNewService}?cityCode=${encodeURIComponent(c.code)}&cityTitle=${encodeURIComponent(c.title)}`,
                )
              }
            >
              {c.title}
            </button>
          ))}
        </div>
      ) : null}
      {!catalogError && sorted.length === 0 ? (
        <p className={patientMutedTextClass}>Нет доступных городов.</p>
      ) : null}
    </div>
  );
}
