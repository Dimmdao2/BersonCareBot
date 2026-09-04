'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from 'recharts';
import type { TodayWeeklyTimelinePoint } from './loadDoctorTodayDashboard';
import { PositiveSizeResponsiveContainer } from '@/shared/ui/charts/PositiveSizeResponsiveContainer';
import { DoctorRechartsTooltip } from '@/shared/ui/doctor/DoctorRechartsTooltip';
import { DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { Card, CardContent, CardHeader } from '@/shared/ui/doctor/primitives/card';

const WEEK_WIDTH = 72;

type ChartPoint = TodayWeeklyTimelinePoint & {
  appointmentsPast: number | null;
  appointmentsFuture: number | null;
};

export function DoctorTodayWeeklyAppointmentsChart({
  points,
}: {
  points: TodayWeeklyTimelinePoint[];
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentIndex = points.findIndex((point) => point.isCurrent);
  const firstFutureIndex = points.findIndex((point) => point.period === 'future');
  const anchorIndex =
    currentIndex >= 0
      ? currentIndex
      : firstFutureIndex >= 0
        ? firstFutureIndex
        : Math.max(0, points.length - 1);
  const [visibleRange, setVisibleRange] = useState(() => ({
    start: Math.max(0, anchorIndex - 4),
    end: Math.min(points.length, anchorIndex + 5),
  }));
  const [scrollOffset, setScrollOffset] = useState(0);
  const chartPoints = useMemo<ChartPoint[]>(
    () =>
      points.map((point) => ({
        ...point,
        appointmentsPast: point.period !== 'future' ? point.appointments : null,
        appointmentsFuture: point.period !== 'past' ? point.appointments : null,
      })),
    [points],
  );
  const chartWidth = Math.max(440, points.length * WEEK_WIDTH);
  const currentPoint = currentIndex >= 0 ? chartPoints[currentIndex] : undefined;
  const visiblePoints = points.slice(visibleRange.start, visibleRange.end);
  const visibleValuesMax = Math.max(
    1,
    ...visiblePoints.flatMap((point) => [point.appointments, point.firstAppointments]),
  );
  const currentIsVisible =
    currentIndex >= 0 && currentIndex >= visibleRange.start && currentIndex < visibleRange.end;

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const updateVisibleRange = () => {
      setScrollOffset(scrollArea.scrollLeft);
      const start = Math.max(0, Math.floor(scrollArea.scrollLeft / WEEK_WIDTH));
      const end = Math.min(
        points.length,
        Math.ceil((scrollArea.scrollLeft + scrollArea.clientWidth) / WEEK_WIDTH) + 1,
      );
      setVisibleRange((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    };

    const currentCenter = (anchorIndex + 0.5) * WEEK_WIDTH;
    scrollArea.scrollLeft = Math.max(0, currentCenter - scrollArea.clientWidth / 2);
    updateVisibleRange();
    scrollArea.addEventListener('scroll', updateVisibleRange, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateVisibleRange);
    resizeObserver?.observe(scrollArea);
    return () => {
      scrollArea.removeEventListener('scroll', updateVisibleRange);
      resizeObserver?.disconnect();
    };
  }, [anchorIndex, points.length]);

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col gap-2 py-3">
      <CardHeader className="shrink-0 px-3">
        <DoctorSectionTitle>Записи по неделям</DoctorSectionTitle>
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 flex-1 px-0 pb-0">
        <div
          ref={scrollAreaRef}
          className="doctor-weekly-chart-scroll doctor-touch-focus-surface h-full w-full overflow-x-auto overscroll-x-contain"
        >
          <div className="h-full min-h-0 px-2 pb-2" style={{ width: chartWidth, minWidth: '100%' }}>
            <PositiveSizeResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints} margin={{ top: 12, right: 14, left: 0, bottom: 2 }}>
                <CartesianGrid
                  stroke="var(--border)"
                  vertical={false}
                  syncWithTicks
                  horizontal={({ key, offset, x1, x2, y1, y2 }) => (
                    <line
                      key={key}
                      x1={x1}
                      x2={x2}
                      y1={y1}
                      y2={y2}
                      stroke={Number(y1) <= offset.top + 0.5 ? 'transparent' : 'var(--border)'}
                    />
                  )}
                />
                <XAxis
                  dataKey="label"
                  tick={({ x, y, payload }) => (
                    <text
                      x={x}
                      y={y}
                      dy="0.71em"
                      fill={chartPoints[payload.index]?.isCurrent ? '#c4594f' : '#8b929b'}
                      fontSize={10}
                      textAnchor="middle"
                    >
                      {payload.value}
                    </text>
                  )}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={24}
                />
                <YAxis
                  domain={[0, visibleValuesMax]}
                  width={32}
                  allowDecimals={false}
                  allowDataOverflow
                  padding={{ top: 10, bottom: 10 }}
                  tick={({ y, payload }) => (
                    <text
                      x={scrollOffset + 2}
                      y={y}
                      dy="0.32em"
                      fill="#8b929b"
                      fontSize={10}
                      textAnchor="start"
                    >
                      {payload.value}
                    </text>
                  )}
                  tickLine={false}
                  axisLine={false}
                />
                <DoctorRechartsTooltip
                  formatter={(value, name) => [String(value), String(name)]}
                  labelFormatter={(label) => `Неделя ${String(label)}`}
                />
                <Bar
                  dataKey="firstAppointments"
                  name="Новых пациентов"
                  fill="#8fb1dd"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="appointmentsPast"
                  name="Записей"
                  stroke="#59616b"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: '#59616b', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="appointmentsFuture"
                  name="Записей"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: 'var(--primary)', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {currentPoint && currentIsVisible ? (
                  <ReferenceDot
                    x={currentPoint.label}
                    y={currentPoint.appointments}
                    r={5}
                    fill="var(--primary)"
                    stroke="#c4594f"
                    strokeWidth={3}
                    ifOverflow="visible"
                  />
                ) : null}
              </ComposedChart>
            </PositiveSizeResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
