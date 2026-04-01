"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { useBookingCatalogServices } from "../../../cabinet/useBookingCatalog";

type Props = {
  cityCode: string;
  cityTitle: string;
};

export function ServiceStepClient({ cityCode, cityTitle }: Props) {
  const router = useRouter();
  const catalogServices = useBookingCatalogServices(cityCode, true);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Услуга</h2>
        <Badge variant="outline">Шаг 3</Badge>
      </div>
      {catalogServices.loading ? <p className="text-sm text-muted-foreground">Загрузка услуг…</p> : null}
      {catalogServices.error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{catalogServices.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void catalogServices.reload()}>
            Повторить
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {catalogServices.services.map((s) => {
          const title = s.service?.title ?? "Услуга";
          const dur = s.service?.durationMinutes;
          const label = dur != null ? `${title} (${dur} мин.)` : title;
          const desc = s.service?.description?.trim();
          return (
            <Button
              key={s.id}
              type="button"
              variant="outline"
              className="h-auto min-h-11 flex-col items-stretch justify-center gap-1 whitespace-normal py-3 text-left"
              onClick={() =>
                router.push(
                  `${routePaths.bookingNewSlot}?type=in_person` +
                    `&cityCode=${encodeURIComponent(cityCode)}` +
                    `&cityTitle=${encodeURIComponent(cityTitle)}` +
                    `&branchServiceId=${encodeURIComponent(s.id)}` +
                    `&serviceTitle=${encodeURIComponent(title)}`,
                )
              }
            >
              <span className="font-medium">{label}</span>
              {desc ? <span className="text-xs font-normal text-muted-foreground">{desc}</span> : null}
            </Button>
          );
        })}
      </div>
      {catalogServices.services.length === 0 && !catalogServices.loading && !catalogServices.error ? (
        <p className="text-sm text-muted-foreground">Нет доступных услуг в этом городе.</p>
      ) : null}
    </div>
  );
}
