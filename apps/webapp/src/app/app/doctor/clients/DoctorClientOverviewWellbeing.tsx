"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import {
  doctorClientOverviewSecondaryCardClass,
  doctorClientSectionTitleClass,
} from "./doctorClientCardChrome";
import { cn } from "@/lib/utils";

const PatientWellbeingWeekComposedChart = lazy(
  () => import("@/modules/diaries/components/PatientWellbeingWeekComposedChart"),
);

function Sparkline({ model }: { model: WellbeingWeekChartModel }) {
  const points = model.aggregateSeries.length > 0 ? model.aggregateSeries : model.instantSeries;
  if (points.length === 0 && model.warmupScatter.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет записей за неделю</p>;
  }

  const viewW = 200;
  const viewH = 40;
  const spanMs = Math.max(model.weekEndMs - model.weekStartMs, 1);

  const xForT = (t: number) => {
    if (points.length === 1 && model.warmupScatter.length === 0) return viewW / 2;
    const ratio = (t - model.weekStartMs) / spanMs;
    return Math.min(viewW, Math.max(0, ratio * viewW));
  };

  const values = points.map((p) => p.v);
  const min = values.length > 0 ? Math.min(...values, 0) : 0;
  const max = values.length > 0 ? Math.max(...values, 10) : 10;
  const range = max - min || 1;
  const yForV = (v: number) => viewH - ((v - min) / range) * viewH;

  const coords =
    points.length > 0
      ? points
          .map((p) => {
            const x = xForT(p.t);
            const y = yForV(p.v);
            return `${x},${y}`;
          })
          .join(" ")
      : "";

  const last = values.length > 0 ? values[values.length - 1] : null;

  return (
    <div className="flex min-h-[2.5rem] w-full items-end justify-between gap-3">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="h-10 min-w-0 flex-1 text-primary"
        preserveAspectRatio="none"
        aria-hidden
      >
        {coords ? (
          <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={coords} />
        ) : null}
        {model.warmupScatter.map((p) => (
          <circle
            key={`lfk-${p.t}-${p.v}`}
            cx={xForT(p.t)}
            cy={yForV(p.v)}
            r={3}
            className="fill-amber-500 stroke-none"
          />
        ))}
      </svg>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {last != null ? (
          <span className="text-sm tabular-nums text-muted-foreground">Последнее: {last}/10</span>
        ) : (
          <span className="text-sm text-muted-foreground">Разминка</span>
        )}
        {model.warmupScatter.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-amber-500 align-middle" /> разминка
          </span>
        ) : null}
      </div>
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
    <section id="doctor-client-section-wellbeing" className={doctorClientOverviewSecondaryCardClass}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={doctorClientSectionTitleClass}>Самочувствие</h3>
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
          <div className="mt-1 h-[220px] w-full min-w-0">
            <PatientWellbeingWeekComposedChart model={chartModel} iana={displayTimeZone} />
          </div>
        </Suspense>
      ) : null}
    </section>
  );
}
