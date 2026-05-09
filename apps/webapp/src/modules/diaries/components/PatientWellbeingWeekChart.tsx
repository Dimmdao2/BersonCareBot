"use client";

import dynamic from "next/dynamic";
import type { PatientWellbeingWeekComposedChartProps } from "./PatientWellbeingWeekComposedChart";

const Inner = dynamic(() => import("./PatientWellbeingWeekComposedChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] w-full animate-pulse rounded-[var(--patient-card-radius-mobile)] bg-[var(--patient-color-primary-soft)]/20 lg:rounded-[var(--patient-card-radius-desktop)]" />
  ),
});

export type PatientWellbeingWeekChartProps = PatientWellbeingWeekComposedChartProps;

/** График вытесняет горизонтальный padding секции. */
export function PatientWellbeingWeekChart(chartProps: PatientWellbeingWeekChartProps) {
  return (
    <div className="-mx-4 min-w-0 overflow-x-visible">
      <Inner {...chartProps} />
    </div>
  );
}
