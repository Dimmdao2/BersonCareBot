'use client';

import { DateTime } from 'luxon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { isCancelledAppointmentStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import type { CalendarEvent } from '@/modules/booking-calendar/types';
import { PositiveSizeResponsiveContainer } from '@/shared/ui/charts/PositiveSizeResponsiveContainer';
import { DoctorRechartsTooltip } from '@/shared/ui/doctor/DoctorRechartsTooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';

type WeeklyPoint = {
  weekStart: string;
  label: string;
  appointments: number;
};

type CalendarFeedResponse = {
  ok: boolean;
  events?: CalendarEvent[];
};

function buildEmptyWeeks(todayIso: string, displayIana: string): WeeklyPoint[] {
  const currentWeek = DateTime.fromISO(todayIso, { zone: displayIana }).startOf('week');
  return Array.from({ length: 5 }, (_, index) => {
    const week = currentWeek.minus({ weeks: 4 - index });
    return {
      weekStart: week.toISODate() ?? '',
      label: week.toFormat('dd.LL'),
      appointments: 0,
    };
  });
}

export function DoctorTodayWeeklyAppointmentsChart({
  todayIso,
  displayIana,
}: {
  todayIso: string;
  displayIana: string;
}) {
  const emptyWeeks = useMemo(() => buildEmptyWeeks(todayIso, displayIana), [displayIana, todayIso]);
  const [points, setPoints] = useState(emptyWeeks);
  const [loadFailed, setLoadFailed] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const from = emptyWeeks[0]?.weekStart;
    if (!from) return () => abortController.abort();

    async function load(): Promise<void> {
      try {
        const query = new URLSearchParams({ view: 'feed', from, to: todayIso });
        const response = await fetch(`/api/doctor/booking-engine/calendar?${query.toString()}`, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error('calendar_load_failed');
        const payload = (await response.json()) as CalendarFeedResponse;
        if (!payload.ok || !Array.isArray(payload.events)) throw new Error('calendar_load_failed');

        const counts = new Map(emptyWeeks.map((week) => [week.weekStart, 0]));
        for (const event of payload.events) {
          if (event.kind !== 'appointment' || isCancelledAppointmentStatus(event.status)) continue;
          let start = DateTime.fromISO(event.startAt, { setZone: true });
          if (!start.isValid) start = DateTime.fromSQL(event.startAt, { setZone: true });
          if (!start.isValid) start = DateTime.fromJSDate(new Date(event.startAt));
          const weekStart = start.isValid
            ? start.setZone(displayIana).startOf('week').toISODate()
            : null;
          if (weekStart && counts.has(weekStart)) {
            counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
          }
        }

        setPoints(
          emptyWeeks.map((week) => ({
            ...week,
            appointments: counts.get(week.weekStart) ?? 0,
          })),
        );
        setLoadFailed(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadFailed(true);
      }
    }

    void load();
    return () => abortController.abort();
  }, [displayIana, emptyWeeks, todayIso]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) scrollArea.scrollLeft = scrollArea.scrollWidth;
  }, [points]);

  const yMax = Math.max(1, ...points.map((point) => point.appointments));

  return (
    <Card className="min-w-0 py-3">
      <CardHeader className="px-3">
        <CardTitle>Записи по неделям</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-0">
        {loadFailed ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">Не удалось загрузить график</p>
        ) : (
          <div ref={scrollAreaRef} className="w-full overflow-x-auto overscroll-x-contain">
            <div className="h-[112px] min-w-[440px] px-2">
              <PositiveSizeResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    width={28}
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <DoctorRechartsTooltip
                    formatter={(value) => [String(value), 'Записей']}
                    labelFormatter={(label) => `Неделя с ${String(label)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="appointments"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </PositiveSizeResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
