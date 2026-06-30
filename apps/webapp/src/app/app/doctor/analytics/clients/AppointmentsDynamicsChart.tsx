"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { StatsPeriod } from "@/modules/diaries/stats/periodWindow";
import { diaryChartFormatTickLabel, diaryChartShowTick } from "@/modules/diaries/stats/formatDiaryChartTick";
import type { AppointmentDayPoint } from "@/modules/doctor-appointments/ports";
import { DoctorRechartsTooltip } from "@/shared/ui/doctor/DoctorRechartsTooltip";

const STROKE_VISITS = "hsl(215 65% 38%)";
const STROKE_BOOKINGS = "hsl(142 55% 36%)";
const STROKE_CANCELS = "hsl(22 82% 46%)";

type LineKey = "pastVisits" | "bookingsCreated" | "cancellationActions";

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return "week";
  if (n <= 31) return "month";
  return "all";
}

const LINE_LABELS: Record<LineKey, string> = {
  pastVisits: "Визиты",
  bookingsCreated: "Записались",
  cancellationActions: "Отмены",
};

export function AppointmentsDynamicsChart({ series }: { series: AppointmentDayPoint[] }) {
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    pastVisits: true,
    bookingsCreated: true,
    cancellationActions: true,
  });

  const period = chartPeriodForPointCount(series.length);
  const data = series.map((p) => ({
    full: p.day,
    pastVisits: p.pastVisits,
    bookingsCreated: p.bookingsCreated,
    cancellationActions: p.cancellationActions,
  }));
  const yMax = Math.max(
    1,
    ...series.flatMap((s) => [s.pastVisits, s.bookingsCreated, s.cancellationActions]),
  );

  function handleLegendClick(e: { dataKey?: unknown }) {
    const key = e.dataKey as LineKey;
    if (key in visible) {
      setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  }

  return (
    <div className="h-[260px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="full"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            interval={0}
            tickFormatter={(full: string, index: number) => {
              const prev = index > 0 ? data[index - 1]?.full ?? null : null;
              if (!diaryChartShowTick(period, index, data.length, full, prev)) return "";
              return diaryChartFormatTickLabel(full, period);
            }}
          />
          <YAxis
            domain={[0, yMax]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
          />
          <DoctorRechartsTooltip
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              const label = LINE_LABELS[name as LineKey] ?? String(name);
              return [`${Number.isFinite(v) ? v : "—"}`, label];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { full?: string } | undefined;
              return p?.full ?? "";
            }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 8, cursor: "pointer" }}
            formatter={(value) => {
              const key = value as LineKey;
              return (
                <span style={{ opacity: visible[key] ? 1 : 0.35 }}>
                  {LINE_LABELS[key] ?? value}
                </span>
              );
            }}
            onClick={handleLegendClick}
          />
          <Line
            type="monotone"
            name="pastVisits"
            dataKey="pastVisits"
            stroke={STROKE_VISITS}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_VISITS, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            hide={!visible.pastVisits}
          />
          <Line
            type="monotone"
            name="bookingsCreated"
            dataKey="bookingsCreated"
            stroke={STROKE_BOOKINGS}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_BOOKINGS, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            hide={!visible.bookingsCreated}
          />
          <Line
            type="monotone"
            name="cancellationActions"
            dataKey="cancellationActions"
            stroke={STROKE_CANCELS}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_CANCELS, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            hide={!visible.cancellationActions}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
