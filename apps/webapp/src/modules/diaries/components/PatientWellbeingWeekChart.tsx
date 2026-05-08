"use client";

import dynamic from "next/dynamic";
import type { PatientWellbeingWeekComposedChartProps } from "./PatientWellbeingWeekComposedChart";

const Inner = dynamic(() => import("./PatientWellbeingWeekComposedChart"), {
  ssr: false,
  loading: () => <div className="bg-muted/50 h-[280px] w-full animate-pulse rounded-md" />,
});

export function PatientWellbeingWeekChart(props: PatientWellbeingWeekComposedChartProps) {
  return <Inner {...props} />;
}
