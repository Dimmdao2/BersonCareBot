'use client';

import { PositiveSizeResponsiveContainer } from '@/shared/ui/charts/PositiveSizeResponsiveContainer';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { StatsPeriod } from '@/modules/diaries/stats/periodWindow';
import {
  diaryChartFormatTickLabel,
  diaryChartShowTick,
} from '@/modules/diaries/stats/formatDiaryChartTick';
import { DoctorRechartsTooltip } from '@/shared/ui/doctor/DoctorRechartsTooltip';

const STROKES = [
  'hsl(215 65% 38%)',
  'hsl(142 55% 36%)',
  'hsl(22 82% 46%)',
] as const;

type SeriesDef = { key: string; label: string };

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return 'week';
  if (n <= 31) return 'month';
  return 'all';
}

export function PlatformAnalyticsLineChart({
  days,
  series,
}: {
  days: string[];
  series: { def: SeriesDef; values: number[] }[];
}) {
  const period = chartPeriodForPointCount(days.length);
  const data = days.map((full, index) => {
    const row: Record<string, string | number> = { full };
    for (const item of series) {
      row[item.def.key] = item.values[index] ?? 0;
    }
    return row;
  });
  const yMax = Math.max(
    1,
    ...series.flatMap((item) => item.values),
  );

  return (
    <div className="h-[220px] w-full min-w-0 pb-2">
      <PositiveSizeResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="full"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            interval={0}
            tickFormatter={(full: string, index: number) => {
              const prev = index > 0 ? (data[index - 1]?.full as string | undefined) ?? null : null;
              if (!diaryChartShowTick(period, index, data.length, full, prev)) return '';
              return diaryChartFormatTickLabel(full, period);
            }}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, yMax]}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            width={36}
          />
          <DoctorRechartsTooltip />
          <Legend />
          {series.map((item, index) => (
            <Line
              key={item.def.key}
              type="monotone"
              dataKey={item.def.key}
              name={item.def.label}
              stroke={STROKES[index % STROKES.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: STROKES[index % STROKES.length], strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </PositiveSizeResponsiveContainer>
    </div>
  );
}
