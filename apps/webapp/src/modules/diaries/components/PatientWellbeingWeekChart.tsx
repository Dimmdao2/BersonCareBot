"use client";

import dynamic from "next/dynamic";
import type { WarmupWeekImpactSummary } from "@/modules/diaries/buildWarmupWeekImpactSummary";
import type { PatientWellbeingWeekComposedChartProps } from "./PatientWellbeingWeekComposedChart";
import { PatientWarmupWeekImpactBanner } from "./PatientWarmupWeekImpactBanner";

const Inner = dynamic(() => import("./PatientWellbeingWeekComposedChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] w-full animate-pulse rounded-[var(--patient-card-radius-mobile)] bg-[var(--patient-color-primary-soft)]/20 lg:rounded-[var(--patient-card-radius-desktop)]" />
  ),
});

export type PatientWellbeingWeekChartProps = PatientWellbeingWeekComposedChartProps & {
  warmupImpactSummary: WarmupWeekImpactSummary;
};

export function PatientWellbeingWeekChart({ warmupImpactSummary, ...chartProps }: PatientWellbeingWeekChartProps) {
  /** График вытесняет горизонтальный padding секции; блок выше — в обычной колонке секции. */
  return (
    <div className="min-w-0 space-y-3">
      <PatientWarmupWeekImpactBanner summary={warmupImpactSummary} />
      <div className="-mx-4 min-w-0">
        <Inner {...chartProps} />
      </div>
    </div>
  );
}
