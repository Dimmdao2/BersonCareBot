'use client';

import { useEffect, useState } from 'react';
import type { ExerciseMetricPoint } from '@/modules/treatment-program/types';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import {
  DoctorExerciseActivityCalendar,
  type DoctorExerciseActivityCalendarDay,
} from '@/shared/ui/doctor/DoctorExerciseActivityCalendar';
import { ExerciseExecutionGraph } from '@/shared/ui/doctor/ExerciseExecutionGraph';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';

type MetricsResponse = {
  ok?: boolean;
  points?: ExerciseMetricPoint[];
};

type CalendarResponse = {
  ok?: boolean;
  iana?: string;
  from?: string;
  days?: DoctorExerciseActivityCalendarDay[];
};

type MetricsState = {
  requestKey: string;
  points: ExerciseMetricPoint[];
  error: boolean;
};

type CalendarDataState = {
  requestKey: string;
  days: DoctorExerciseActivityCalendarDay[];
  iana: string | null;
  state: 'ready' | 'error';
};

function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (value: number) => String(value).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

function todayInZone(iana: string | null): string | undefined {
  if (!iana) return undefined;
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: iana });
  } catch {
    return undefined;
  }
}

export function DoctorExerciseStatisticsModal({
  open,
  onClose,
  patientUserId,
  patientName,
  exerciseTitle,
  instanceId,
  itemId,
}: {
  open: boolean;
  onClose: () => void;
  patientUserId: string;
  /** «Фамилия Имя» пациента справа в первой строке шапки. */
  patientName?: string | null;
  exerciseTitle: string;
  instanceId: string;
  itemId: string;
}) {
  const now = new Date();
  const [metricsState, setMetricsState] = useState<MetricsState>({
    requestKey: '',
    points: [],
    error: false,
  });
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [calendarDataState, setCalendarDataState] = useState<CalendarDataState>({
    requestKey: '',
    days: [],
    iana: null,
    state: 'ready',
  });
  const requestKey = `${patientUserId}:${instanceId}:${itemId}:${calendarYear}-${calendarMonth}`;
  const metrics = metricsState.requestKey === requestKey ? metricsState.points : null;
  const metricsError = metricsState.requestKey === requestKey && metricsState.error;
  const calendarDays = calendarDataState.requestKey === requestKey ? calendarDataState.days : [];
  const calendarState =
    calendarDataState.requestKey === requestKey ? calendarDataState.state : 'loading';
  const calendarIana = calendarDataState.iana;

  useEffect(() => {
    if (!open) return;
    let active = true;
    const range = monthRange(calendarYear, calendarMonth);
    const params = new URLSearchParams({
      instanceId,
      stageItemId: itemId,
      ...range,
    });

    void fetch(`/api/doctor/comments/exercise-metrics?${params.toString()}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as MetricsResponse | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.points)) {
          setMetricsState({ requestKey, points: [], error: true });
          return;
        }
        setMetricsState({ requestKey, points: payload.points, error: false });
      })
      .catch(() => {
        if (!active) return;
        setMetricsState({ requestKey, points: [], error: true });
      });

    return () => {
      active = false;
    };
  }, [calendarMonth, calendarYear, instanceId, itemId, open, requestKey]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const range = monthRange(calendarYear, calendarMonth);
    const params = new URLSearchParams({
      ...range,
      instanceId,
      stageItemId: itemId,
    });

    void fetch(
      `/api/doctor/patients/${encodeURIComponent(patientUserId)}/exercise-calendar?${params.toString()}`,
      { credentials: 'include' },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as CalendarResponse | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.days)) {
          setCalendarDataState((current) => ({
            requestKey,
            days: [],
            iana: current.iana,
            state: 'error',
          }));
          return;
        }
        setCalendarDataState({
          requestKey,
          days: payload.days,
          iana: payload.iana ?? null,
          state: 'ready',
        });
      })
      .catch(() => {
        if (!active) return;
        setCalendarDataState((current) => ({
          requestKey,
          days: [],
          iana: current.iana,
          state: 'error',
        }));
      });

    return () => {
      active = false;
    };
  }, [calendarMonth, calendarYear, instanceId, itemId, open, patientUserId, requestKey]);

  const patientTodayIso = todayInZone(calendarIana);
  const patientToday = patientTodayIso?.split('-').map(Number);
  const currentYear = patientToday?.[0] ?? now.getFullYear();
  const currentMonth = patientToday?.[1] ?? now.getMonth() + 1;
  const disableNext =
    calendarYear > currentYear || (calendarYear === currentYear && calendarMonth >= currentMonth);

  const navigateMonth = (delta: -1 | 1) => {
    if (delta === 1 && disableNext) return;
    const next = new Date(calendarYear, calendarMonth - 1 + delta, 1);
    setCalendarYear(next.getFullYear());
    setCalendarMonth(next.getMonth() + 1);
  };

  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label="Статистика"
          entity={exerciseTitle}
          patientName={patientName}
          patientHref={patientCardHref(patientUserId)}
        />
      }
      size="lg"
      bodyClassName="space-y-4"
    >
      <section className="space-y-3">
        <p className="text-center text-sm leading-5 font-medium text-foreground">Отметки клиента</p>
        <DoctorExerciseActivityCalendar
          days={calendarDays}
          year={calendarYear}
          month={calendarMonth}
          state={calendarState}
          mode="exercise"
          todayIso={patientTodayIso}
          disableNext={disableNext}
          onMonthChange={navigateMonth}
        />
      </section>

      <div className="border-t border-border/60 pt-4">
        {metrics === null ? (
          <DoctorPanelLoading className="min-h-32" />
        ) : metricsError ? (
          <p className="text-sm text-destructive">Не удалось загрузить динамику</p>
        ) : (
          <ExerciseExecutionGraph
            metricPoints={metrics}
            dayBars={[]}
            windowDays={30}
            showWindowToggle={false}
            chartTitle=""
            showRelativeYAxis
            displayIana={calendarIana ?? undefined}
          />
        )}
      </div>
    </DoctorModal>
  );
}
