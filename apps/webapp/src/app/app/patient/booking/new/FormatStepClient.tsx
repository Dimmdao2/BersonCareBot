"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { useBookingCatalogCities } from "../../cabinet/useBookingCatalog";

export function FormatStepClient() {
  const router = useRouter();
  const catalogCities = useBookingCatalogCities(true);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Запись на приём</h2>
        <Badge variant="outline">Шаг 1</Badge>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Очный прием</h3>
        {catalogCities.loading ? (
          <p className={patientMutedTextClass}>Загрузка городов…</p>
        ) : null}
        {catalogCities.error ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{catalogCities.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void catalogCities.reload()}>
              Повторить
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {catalogCities.cities.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(
                  `${routePaths.bookingNewService}?cityCode=${encodeURIComponent(c.code)}&cityTitle=${encodeURIComponent(c.title)}`,
                )
              }
            >
              {c.title}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Онлайн</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 justify-start whitespace-normal text-left"
            onClick={() => router.push(routePaths.intakeLfk)}
          >
            Реабилитация (ЛФК)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 justify-start whitespace-normal text-left"
            onClick={() => router.push(routePaths.intakeNutrition)}
          >
            Нутрициология (анализы)
          </Button>
        </div>
      </div>
    </div>
  );
}
