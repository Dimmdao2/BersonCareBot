"use client";

import Link from "next/link";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { LfkDotState, MiniStatsChartProps } from "./miniStatsTypes";

/** Только классы темы (без произвольных palette-цветов). */
function lfkColor(s: LfkDotState): string {
  if (s === "done") return "bg-primary";
  if (s === "partial") return "bg-primary/50";
  return "bg-muted-foreground/35";
}

export default function MiniStatsRecharts({ points, lfkDays, statsLinkHref }: MiniStatsChartProps) {
  const data = points.map((p) => ({ name: p.t, v: p.v }));
  const inner = (
    <div className="flex w-full flex-col gap-2">
      <div className="h-[88px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between gap-1 px-1">
        {lfkDays.map((s, i) => (
          <span
            key={i}
            className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", lfkColor(s))}
            title={s === "done" ? "ЛФК: занятие" : s === "partial" ? "ЛФК: частично" : "нет отметки"}
          />
        ))}
      </div>
    </div>
  );
  if (statsLinkHref) {
    return (
      <div className="relative">
        <Link
          href={statsLinkHref}
          className="absolute inset-0 z-10 rounded-md"
          aria-label="Открыть дневник и статистику"
        />
        <div className="relative">{inner}</div>
      </div>
    );
  }
  return inner;
}
