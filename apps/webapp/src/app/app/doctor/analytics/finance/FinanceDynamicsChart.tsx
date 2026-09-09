'use client';

import { DateTime } from 'luxon';
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { DoctorFinanceSeriesPoint } from '@/modules/doctor-finance-analytics/ports';
import { PositiveSizeResponsiveContainer } from '@/shared/ui/charts/PositiveSizeResponsiveContainer';
import { DoctorRechartsTooltip } from '@/shared/ui/doctor/DoctorRechartsTooltip';

const LABELS = {
  totalMinor: 'Всего',
  onlineMinor: 'Онлайн',
  cashMinor: 'Наличными',
} as const;

function rubles(minor: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(minor / 100);
}

export function FinanceDynamicsChart({ series }: { series: DoctorFinanceSeriesPoint[] }) {
  return (
    <div className="h-[260px] w-full min-w-0 pb-2">
      <PositiveSizeResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 38 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="bucketStart"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            tickFormatter={(value: string) => DateTime.fromISO(value).toFormat('dd.LL')}
          />
          <YAxis
            width={46}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            tickFormatter={(value: number) => rubles(value)}
          />
          <DoctorRechartsTooltip
            formatter={(value, name) => [
              `${rubles(Number(value))} ₽`,
              LABELS[name as keyof typeof LABELS] ?? String(name),
            ]}
            labelFormatter={(value) => String(value)}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) => LABELS[value as keyof typeof LABELS] ?? value}
          />
          <Line
            type="monotone"
            dataKey="totalMinor"
            stroke="hsl(215 65% 38%)"
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: 'hsl(215 65% 38%)' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="onlineMinor"
            stroke="hsl(142 55% 36%)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'hsl(142 55% 36%)' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="cashMinor"
            stroke="hsl(32 88% 48%)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'hsl(32 88% 48%)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </PositiveSizeResponsiveContainer>
    </div>
  );
}
