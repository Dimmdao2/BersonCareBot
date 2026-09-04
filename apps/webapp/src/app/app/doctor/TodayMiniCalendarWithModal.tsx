'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import type { TodayAppointmentItem } from './loadDoctorTodayDashboard';
import type { DoctorTodayCalendarSnapshot } from './DoctorTodayDashboard';
import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
  CalendarEvent,
  WorkingBounds,
} from '@/modules/booking-calendar/types';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import type {
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import { isCancelledAppointmentStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import { cn } from '@/lib/utils';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

const API_BASE = '/api/doctor/booking-engine';

const EMPTY_FILTER_META: CalendarFilterMeta = {
  specialists: [],
  branches: [],
  rooms: [],
  services: [],
};

const EMPTY_ACTIVE_FILTERS: CalendarCreateActiveFilters = {
  specialistId: null,
  branchId: null,
  roomId: null,
  serviceId: null,
};

function TodayMiniCalendarShellFallback({
  appointments,
  todayDateLabel,
  fillHeight = false,
  flushChrome = false,
}: {
  appointments: TodayAppointmentItem[];
  todayDateLabel: string;
  fillHeight?: boolean;
  flushChrome?: boolean;
}) {
  return (
    <DoctorSection
      id="doctor-today-mini-calendar"
      className={cn(
        fillHeight && 'h-full min-h-0',
        flushChrome && 'rounded-none border-0 bg-transparent p-0',
      )}
    >
      {!flushChrome ? <DoctorSectionTitle>{todayDateLabel}</DoctorSectionTitle> : null}
      {appointments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Записей на сегодня нет</p>
      ) : (
        <ul className="space-y-1 text-sm" aria-label="Записи на сегодня">
          {appointments.map((appt) => (
            <li key={appt.id}>
              <a href={appt.href} className="text-primary hover:underline">
                {appt.time} · {appt.clientLabel}
              </a>
            </li>
          ))}
        </ul>
      )}
      <DoctorPanelLoading className="mt-2 min-h-48" />
    </DoctorSection>
  );
}

/** FullCalendar + plugins — отдельный chunk после shell «Сегодня». */
const DoctorTodayMiniCalendar = dynamic(
  () => import('./DoctorTodayMiniCalendar').then((mod) => mod.DoctorTodayMiniCalendar),
  { ssr: false },
);

/** Event panel — только после клика по записи. */
const DoctorCalendarEventPanel = dynamic(
  () => import('./calendar/DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

type CalendarApiResponse = {
  ok: boolean;
  events?: CalendarEvent[];
  filters?: CalendarFilterMeta;
  resolvedScope?: ResolvedDoctorScheduleScope;
  timeZone?: string;
  showWorkingHours?: boolean;
  workingBounds?: WorkingBounds | null;
  error?: string;
};

const todayCalendarRequests = new Map<string, Promise<CalendarApiResponse>>();

function loadTodayCalendar(todayIso: string, refresh = false): Promise<CalendarApiResponse> {
  if (!refresh) {
    const existing = todayCalendarRequests.get(todayIso);
    if (existing) return existing;
  }

  const qs = new URLSearchParams({ view: 'day', from: todayIso, to: todayIso }).toString();
  const request = fetch(`${API_BASE}/calendar?${qs}`).then(
    async (response) => (await response.json()) as CalendarApiResponse,
  );
  todayCalendarRequests.set(todayIso, request);
  void request.catch(() => {
    if (todayCalendarRequests.get(todayIso) === request) {
      todayCalendarRequests.delete(todayIso);
    }
  });
  return request;
}

type Props = {
  /** Server-rendered fallback list — used for sr-only accessibility and empty-state check. */
  appointments: TodayAppointmentItem[];
  /** Fixed on the RSC render so fallback and loaded calendar use one calendar day. */
  calendarSnapshot: DoctorTodayCalendarSnapshot;
  displayIana: string;
  fillHeight?: boolean;
  flushChrome?: boolean;
};

/**
 * Mini-calendar for «Сегодня» with a full appointment modal.
 *
 * FullCalendar and the event panel load as separate chunks so cold FCP of
 * `/app/doctor` is not blocked on the calendar stack. Until FC arrives, SSR
 * appointment list is shown as the visible shell.
 */
export function TodayMiniCalendarWithModal({
  appointments,
  calendarSnapshot,
  displayIana,
  fillHeight = false,
  flushChrome = false,
}: Props) {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | undefined>(undefined);
  const [filterMeta, setFilterMeta] = useState<CalendarFilterMeta>(EMPTY_FILTER_META);
  const [ownSpecialistId, setOwnSpecialistId] = useState<string | null>(null);
  const [clinicSpecialists, setClinicSpecialists] = useState<
    DoctorScheduleSpecialistOption[] | null
  >(null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [showFc, setShowFc] = useState(false);
  const [workingBounds, setWorkingBounds] = useState<WorkingBounds | null | undefined>(undefined);
  const [calendarTimeZone, setCalendarTimeZone] = useState(displayIana);

  const { todayIso, nowMinutes, todayDateLabel } = calendarSnapshot;
  const visibleAppointments = appointments.filter(
    (appointment) => !isCancelledAppointmentStatus(appointment.status),
  );

  function fetchTodayEvents(onDone?: () => void) {
    loadTodayCalendar(todayIso, true)
      .then((data: CalendarApiResponse) => {
        if (data.ok && Array.isArray(data.events)) setCalendarEvents(data.events);
        if (data.filters) setFilterMeta(data.filters);
        setWorkingBounds(data.workingBounds);
        if (data.timeZone) setCalendarTimeZone(data.timeZone);
        setOwnSpecialistId(data.resolvedScope?.ownSpecialistId ?? null);
        setClinicSpecialists(data.resolvedScope?.specialists ?? null);
        onDone?.();
      })
      .catch(() => {
        /* silently ignore — fallback to server list for sr-only */
      });
  }

  useEffect(() => {
    let cancelled = false;
    loadTodayCalendar(todayIso)
      .then((data: CalendarApiResponse) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.events)) setCalendarEvents(data.events);
        if (data.filters) setFilterMeta(data.filters);
        setWorkingBounds(data.workingBounds);
        if (data.timeZone) setCalendarTimeZone(data.timeZone);
        setOwnSpecialistId(data.resolvedScope?.ownSpecialistId ?? null);
        setClinicSpecialists(data.resolvedScope?.specialists ?? null);
      })
      .catch(() => {
        /* silently ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [todayIso]);

  // Defer FC mount one tick so shell/list paints first (FCP), then hydrate calendar.
  useEffect(() => {
    const id = window.setTimeout(() => setShowFc(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  function handleChanged() {
    setSelected(null);
    fetchTodayEvents();
  }

  return (
    <>
      {showFc ? (
        <DoctorTodayMiniCalendar
          appointments={visibleAppointments}
          todayIso={todayIso}
          calendarEvents={calendarEvents}
          nowMinutes={nowMinutes}
          todayDateLabel={todayDateLabel}
          displayIana={calendarTimeZone}
          workingBounds={workingBounds}
          fillHeight={fillHeight}
          flushChrome={flushChrome}
          onCanonicalEventClick={(appt) => setSelected(appt)}
        />
      ) : (
        <TodayMiniCalendarShellFallback
          appointments={visibleAppointments}
          todayDateLabel={todayDateLabel}
          fillHeight={fillHeight}
          flushChrome={flushChrome}
        />
      )}

      <DoctorModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Детали записи"
        size="lg"
        desktopPresentation="right-sheet"
      >
        {selected ? (
          <DoctorCalendarEventPanel
            apiBase={API_BASE}
            selected={selected}
            timeZone={calendarTimeZone}
            filterMeta={filterMeta}
            activeFilters={EMPTY_ACTIVE_FILTERS}
            ownSpecialistId={ownSpecialistId}
            clinicSpecialists={clinicSpecialists}
            onClose={() => setSelected(null)}
            onChanged={handleChanged}
            flushChrome
          />
        ) : null}
      </DoctorModal>
    </>
  );
}
