"use client";

import { DateTime } from "luxon";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";

const STROKE_AREA = "hsl(var(--patient-color-primary, 215 65% 38%))";
const FILL_AREA = "hsl(var(--patient-color-primary-soft, 215 65% 38%) / 0.22)";
const STROKE_INSTANT = "hsl(var(--muted-foreground))";

const SCATTER_FILL: Record<string, string> = {
  low: "hsl(38 85% 52%)",
  mid: "hsl(142 48% 42%)",
  high: "hsl(142 72% 34%)",
};

export type PatientWellbeingWeekComposedChartProps = {
  model: WellbeingWeekChartModel;
  /** IANA для подписей оси X */
  iana: string;
};

function weekDayTicks(weekStartMs: number, iana: string): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const ms = DateTime.fromMillis(weekStartMs, { zone: iana }).plus({ days: i }).startOf("day").toMillis();
    ticks.push(ms);
  }
  return ticks;
}

export default function PatientWellbeingWeekComposedChart({ model, iana }: PatientWellbeingWeekComposedChartProps) {
  const { aggregateSeries, instantSeries, warmupScatter, weekStartMs, weekEndMs } = model;
  const ticks = weekDayTicks(weekStartMs, iana);

  const aggData = aggregateSeries.map((p) => ({ x: p.t, y: p.v }));
  const instData = instantSeries.map((p) => ({ x: p.t, y: p.v }));
  const scatterData = warmupScatter.map((p) => ({ x: p.t, y: p.v, band: p.band }));

  const valuesAll = [
    ...aggregateSeries.map((p) => p.v),
    ...instantSeries.map((p) => p.v),
    ...warmupScatter.map((p) => p.v),
  ];
  const maxObserved = valuesAll.length > 0 ? Math.max(...valuesAll) : 0;
  const yTop = maxObserved <= 5 ? 5 : 10;
  const yTicks = yTop <= 5 ? ([0, 5] as const) : ([0, 5, 10] as const);
  const yLabel = yTop <= 5 ? "0–5" : "0–10";

  return (
    <div className="h-[280px] w-full min-w-0 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[weekStartMs, weekEndMs]}
            scale="linear"
            allowDataOverflow
            ticks={ticks}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            tickFormatter={(ms: number) => DateTime.fromMillis(ms, { zone: iana }).toFormat("ccc d")}
          />
          <YAxis
            domain={[0, yTop]}
            width={36}
            ticks={[...yTicks]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 10, dx: -4 }}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = typeof value === "number" ? value : Number(value);
              const n = typeof name === "string" ? name : String(name ?? "");
              const labels: Record<string, string> = {
                aggregate: "Среднее за день",
                instant: "Отметки в течение дня",
                warmup: "После разминки",
              };
              if (value === undefined || value === null || !Number.isFinite(v)) {
                return ["—", labels[n] ?? n];
              }
              return [`${v.toFixed(1)}`, labels[n] ?? n];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { x?: number } | undefined;
              const x = p?.x;
              if (x == null) return "";
              return DateTime.fromMillis(x, { zone: iana }).toFormat("ccc d MMM, HH:mm");
            }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
            }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 12 }}
            formatter={(value) =>
              value === "aggregate" ? "Среднее за день"
              : value === "instant" ? "Отметки в течение дня"
              : value === "warmup" ? "После разминки"
              : value
            }
          />
          <Area
            data={aggData}
            type="monotone"
            dataKey="y"
            name="aggregate"
            stroke={STROKE_AREA}
            strokeWidth={2.5}
            fill={FILL_AREA}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            data={instData}
            type="linear"
            dataKey="y"
            name="instant"
            stroke={STROKE_INSTANT}
            strokeWidth={1}
            strokeOpacity={0.45}
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Scatter
            data={scatterData}
            dataKey="y"
            name="warmup"
            fill={SCATTER_FILL.mid}
            line={false}
            zIndex={10}
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { band?: string };
            }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return null;
              const band = payload?.band ?? "mid";
              const fill = SCATTER_FILL[band] ?? SCATTER_FILL.mid;
              return <circle cx={cx} cy={cy} r={5} fill={fill} stroke="hsl(var(--background))" strokeWidth={1} />;
            }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
