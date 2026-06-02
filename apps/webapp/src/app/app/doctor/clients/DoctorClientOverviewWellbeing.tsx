"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import { cn } from "@/lib/utils";

const PatientWellbeingWeekComposedChart = lazy(
  () => import("@/modules/diaries/components/PatientWellbeingWeekComposedChart"),
);

function Sparkline({ model }: { model: WellbeingWeekChartModel }) {
  const points = model.aggregateSeries.length > 0 ? model.aggregateSeries : model.instantSeries;
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет записей за неделю</p>;
  }
  const values = points.map((p) => p.v);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 10);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const coords = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  return (
    <div className="flex items-end gap-3">
      <svg width={w} height={h} className="shrink-0 text-primary" aria-hidden>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={coords}
        />
      </svg>
      <span className="text-sm tabular-nums text-muted-foreground">Последнее: {last}/10</span>
    </div>
  );
}

type Props = {
  chartModel: WellbeingWeekChartModel;
  displayTimeZone: string;
};

export function DoctorClientOverviewWellbeing({ chartModel, displayTimeZone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasData = useMemo(
    () =>
      chartModel.aggregateSeries.length > 0 ||
      chartModel.instantSeries.length > 0 ||
      chartModel.warmupScatter.length > 0,
    [chartModel],
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Самочувствие</h3>
        {hasData ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Свернуть" : "Подробный график"}
          </Button>
        ) : null}
      </div>
      {!expanded ? <Sparkline model={chartModel} /> : null}
      {expanded ? (
        <Suspense
          fallback={<p className={cn("text-sm text-muted-foreground")}>Загрузка графика…</p>}
        >
          <div className="mt-2 h-[220px] w-full min-w-0">
            <PatientWellbeingWeekComposedChart model={chartModel} iana={displayTimeZone} />
          </div>
        </Suspense>
      ) : null}
    </section>
  );
}
