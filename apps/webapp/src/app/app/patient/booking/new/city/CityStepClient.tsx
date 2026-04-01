"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { useBookingCatalogCities } from "../../../cabinet/useBookingCatalog";

export function CityStepClient() {
  const router = useRouter();
  const catalogCities = useBookingCatalogCities(true);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Город</h2>
        <Badge variant="outline">Шаг 2</Badge>
      </div>
      {catalogCities.loading ? <p className="text-sm text-muted-foreground">Загрузка городов…</p> : null}
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
  );
}
