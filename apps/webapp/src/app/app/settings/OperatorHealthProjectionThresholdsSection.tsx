"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { patchAdminSetting } from "./patchAdminSetting";
import type { OperatorHealthProjectionThresholds } from "@/modules/operator-health/operatorHealthProjectionThresholds";

export type OperatorHealthProjectionThresholdsSectionProps = {
  initialThresholds: OperatorHealthProjectionThresholds;
};

export function OperatorHealthProjectionThresholdsSection({
  initialThresholds,
}: OperatorHealthProjectionThresholdsSectionProps) {
  const [thresholds, setThresholds] = useState(() => ({ ...initialThresholds }));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setMinutes(key: keyof OperatorHealthProjectionThresholds, raw: string) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    setThresholds((t) => ({ ...t, [key]: n }));
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting("operator_health_projection_thresholds", thresholds);
      if (!ok) {
        setError("Не удалось сохранить");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="text-base">Projection (сводка)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Ретраи, мин</span>
          <Input
            type="number"
            min={1}
            value={thresholds.retriesDebounceMinutes}
            onChange={(e) => setMinutes("retriesDebounceMinutes", e.target.value)}
            className="w-36"
            aria-label="Ретраи, мин"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Долгий pending, мин</span>
          <Input
            type="number"
            min={1}
            value={thresholds.stalePendingDebounceMinutes}
            onChange={(e) => setMinutes("stalePendingDebounceMinutes", e.target.value)}
            className="w-36"
            aria-label="Долгий pending, мин"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Возраст pending, мин</span>
          <Input
            type="number"
            min={5}
            value={thresholds.oldestPendingStaleMinutes}
            onChange={(e) => setMinutes("oldestPendingStaleMinutes", e.target.value)}
            className="w-36"
            aria-label="Возраст pending, мин"
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? <p className="text-sm text-muted-foreground">Сохранено</p> : null}
        <Button type="button" disabled={isPending} onClick={handleSave}>
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
