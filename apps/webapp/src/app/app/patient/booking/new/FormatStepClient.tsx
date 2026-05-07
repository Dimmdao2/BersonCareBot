"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCity } from "@/modules/booking-catalog/types";
import {
  patientCardClass,
  patientInfoLinkTileClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

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
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <h3 className={patientSectionTitleClass}>Запись</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
                  className={patientInfoLinkTileClass}
                >
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
            className={cn(patientInfoLinkTileClass, "w-full text-left")}
            onClick={() => router.push(routePaths.intakeLfk)}
          >
            Реабилитация онлайн
          </button>
          <button
            type="button"
            className={cn(patientInfoLinkTileClass, "w-full text-left")}
            onClick={() => router.push(routePaths.intakeNutrition)}
          >
            Нутрициология онлайн
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
