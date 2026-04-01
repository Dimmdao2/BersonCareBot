"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";

export function FormatStepClient() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Формат приёма</h2>
        <Badge variant="outline">Шаг 1</Badge>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => router.push(routePaths.bookingNewCity)}
        >
          Очный приём
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => router.push(routePaths.intakeLfk)}
        >
          Онлайн — Реабилитация (ЛФК)
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-14 justify-start text-left"
          onClick={() => router.push(routePaths.intakeNutrition)}
        >
          Онлайн — Нутрициология
        </Button>
      </div>
    </div>
  );
}
