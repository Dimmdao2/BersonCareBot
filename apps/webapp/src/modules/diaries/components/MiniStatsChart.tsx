"use client";

import dynamic from "next/dynamic";
import type { MiniStatsChartProps } from "./miniStatsTypes";

const RechartsMini = dynamic(() => import("./MiniStatsRecharts"), { ssr: false, loading: () => <MiniStatsSkeleton /> });

function MiniStatsSkeleton() {
  return <div className="bg-muted/50 h-[100px] w-full animate-pulse rounded-md" />;
}

export function MiniStatsChart(props: MiniStatsChartProps) {
  return <RechartsMini {...props} />;
}
