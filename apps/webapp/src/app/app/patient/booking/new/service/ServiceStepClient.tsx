"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingBranchService } from "@/modules/booking-catalog/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";

export type ServiceStepClientProps = {
  cityCode: string;
  cityTitle: string;
  services: BookingBranchService[];
  catalogError: string | null;
};

export function ServiceStepClient({ cityCode, cityTitle, services, catalogError }: ServiceStepClientProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
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
          {services.map((s) => {
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
                {desc ? <span className={cn(patientMutedTextClass, "text-xs font-normal")}>{desc}</span> : null}
              </Button>
            );
          })}
        </div>
      ) : null}

      {!catalogError && services.length === 0 ? (
        <p className={patientMutedTextClass}>Нет доступных услуг в этом городе.</p>
      ) : null}
    </div>
  );
}
