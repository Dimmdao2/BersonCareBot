'use client';

import { PositiveSizeResponsiveContainer } from '@/shared/ui/charts/PositiveSizeResponsiveContainer';

import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { StatsPeriod } from '@/modules/diaries/stats/periodWindow';
import { diaryChartFormatTickLabel, diaryChartShowTick } from '@/modules/diaries/stats/formatDiaryChartTick';
import type { ProgramActivityDayPoint } from '@/modules/doctor-program-activity/ports';
import { DoctorRechartsTooltip } from '@/shared/ui/doctor/DoctorRechartsTooltip';

const STROKE_DONE = 'hsl(142 45% 42%)';
const STROKE_PATIENTS = 'hsl(215 65% 38%)';

type LineKey = 'doneCount' | 'activePatientsCount';

function chartPeriodForPointCount(n: number): StatsPeriod {
  if (n <= 7) return 'week';
  if (n <= 31) return 'month';
  return 'all';
}

const LINE_LABELS: Record<LineKey, string> = {
  doneCount: 'Отметок',
  activePatientsCount: 'Активных пациентов',
};

/** Тот же паттерн, что `AppointmentsDynamicsChart` — своя пара серий, общие recharts-примитивы. */
export function ProgramActivityDynamicsChart({ series }: { series: ProgramActivityDayPoint[] }) {
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    doneCount: true,
    activePatientsCount: true,
  });

  const period = chartPeriodForPointCount(series.length);
  const data = series.map((p) => ({
    full: p.day,
    doneCount: p.doneCount,
    activePatientsCount: p.activePatientsCount,
  }));
  const yMax = Math.max(1, ...series.flatMap((s) => [s.doneCount, s.activePatientsCount]));

  function handleLegendClick(e: { dataKey?: unknown }) {
    const key = e.dataKey as LineKey;
    if (key in visible) {
      setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  }

  return (
    <div className="h-[260px] w-full min-w-0 pb-2">
      <PositiveSizeResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 48 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="full"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            interval={0}
            tickFormatter={(full: string, index: number) => {
              const prev = index > 0 ? (data[index - 1]?.full ?? null) : null;
              if (!diaryChartShowTick(period, index, data.length, full, prev)) return '';
              return diaryChartFormatTickLabel(full, period);
            }}
          />
          <YAxis
            domain={[0, yMax]}
            width={36}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
          />
          <DoctorRechartsTooltip
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value : Number(value);
              const label = LINE_LABELS[name as LineKey] ?? String(name);
              return [`${Number.isFinite(v) ? v : '—'}`, label];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { full?: string } | undefined;
              return p?.full ?? '';
            }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 8, cursor: 'pointer' }}
            formatter={(value) => {
              const key = value as LineKey;
              return (
                <span style={{ opacity: visible[key] ? 1 : 0.35 }}>{LINE_LABELS[key] ?? value}</span>
              );
            }}
            onClick={handleLegendClick}
          />
          <Line
            type="monotone"
            name="doneCount"
            dataKey="doneCount"
            stroke={STROKE_DONE}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_DONE, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            hide={!visible.doneCount}
          />
          <Line
            type="monotone"
            name="activePatientsCount"
            dataKey="activePatientsCount"
            stroke={STROKE_PATIENTS}
            strokeWidth={2}
            dot={{ r: 3, fill: STROKE_PATIENTS, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            hide={!visible.activePatientsCount}
          />
        </LineChart>
      </PositiveSizeResponsiveContainer>
    </div>
  );
}
