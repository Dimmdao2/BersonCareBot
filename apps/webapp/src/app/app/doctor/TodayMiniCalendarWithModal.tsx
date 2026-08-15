'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/shared/ui/doctor/primitives/dialog';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';
import Link from 'next/link';
import type { TodayAppointmentItem } from './loadDoctorTodayDashboard';
import type { DoctorTodayCalendarSnapshot } from './DoctorTodayDashboard';
import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
  CalendarEvent,
} from '@/modules/booking-calendar/types';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import type { ResolvedDoctorScheduleScope } from '@/modules/doctor-schedule/scope';

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
}: {
  appointments: TodayAppointmentItem[];
  todayDateLabel: string;
}) {
  return (
    <DoctorSection id="doctor-today-mini-calendar">
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>{todayDateLabel}</DoctorSectionTitle>
        <Link href="/app/doctor/schedule?tab=calendar" className={buttonVariants({ size: 'sm' })}>
          Открыть расписание
        </Link>
      </div>
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
      <div className="mt-2 h-48 animate-pulse rounded-lg border border-border bg-muted/30" />
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
  () =>
    import('./calendar/DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

type CalendarApiResponse = {
  ok: boolean;
  events?: CalendarEvent[];
  filters?: CalendarFilterMeta;
  resolvedScope?: ResolvedDoctorScheduleScope;
  error?: string;
};

type Props = {
  /** Server-rendered fallback list — used for sr-only accessibility and empty-state check. */
  appointments: TodayAppointmentItem[];
  /** Fixed on the RSC render so fallback and loaded calendar use one calendar day. */
  calendarSnapshot: DoctorTodayCalendarSnapshot;
  displayIana: string;
  workingBounds?: { startMinute: number; endMinute: number } | null;
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
  workingBounds,
}: Props) {
  const [calendarEvents, setCalendarEvents] = useState<CalendarAppointmentEvent[]>([]);
  const [filterMeta, setFilterMeta] = useState<CalendarFilterMeta>(EMPTY_FILTER_META);
  const [ownSpecialistId, setOwnSpecialistId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [showFc, setShowFc] = useState(false);

  const { todayIso, nowMinutes, todayDateLabel } = calendarSnapshot;

  function fetchTodayEvents(onDone?: () => void) {
    const qs = new URLSearchParams({ view: 'day', from: todayIso, to: todayIso }).toString();
    fetch(`${API_BASE}/calendar?${qs}`)
      .then((r) => r.json())
      .then((data: CalendarApiResponse) => {
        if (data.ok && Array.isArray(data.events)) {
          const appts = data.events.filter(
            (e): e is CalendarAppointmentEvent => e.kind === 'appointment',
          );
          setCalendarEvents(appts);
        }
        if (data.filters) setFilterMeta(data.filters);
        setOwnSpecialistId(data.resolvedScope?.ownSpecialistId ?? null);
        onDone?.();
      })
      .catch(() => {
        /* silently ignore — fallback to server list for sr-only */
      });
  }

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ view: 'day', from: todayIso, to: todayIso }).toString();
    fetch(`${API_BASE}/calendar?${qs}`)
      .then((r) => r.json())
      .then((data: CalendarApiResponse) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.events)) {
          const appts = data.events.filter(
            (e): e is CalendarAppointmentEvent => e.kind === 'appointment',
          );
          setCalendarEvents(appts);
        }
        if (data.filters) setFilterMeta(data.filters);
        setOwnSpecialistId(data.resolvedScope?.ownSpecialistId ?? null);
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
          appointments={appointments}
          todayIso={todayIso}
          calendarEvents={calendarEvents}
          nowMinutes={nowMinutes}
          todayDateLabel={todayDateLabel}
          displayIana={displayIana}
          workingBounds={workingBounds}
          onCanonicalEventClick={(appt) => setSelected(appt)}
        />
      ) : (
        <TodayMiniCalendarShellFallback
          appointments={appointments}
          todayDateLabel={todayDateLabel}
        />
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-sm overflow-hidden p-0 [&>[data-slot=dialog-close]]:size-10 [&>[data-slot=dialog-close]>svg]:size-5">
          <div className="overflow-y-auto max-h-[90dvh]">
            {selected ? (
              <DoctorCalendarEventPanel
                apiBase={API_BASE}
                selected={selected}
                timeZone={displayIana}
                filterMeta={filterMeta}
                activeFilters={EMPTY_ACTIVE_FILTERS}
                ownSpecialistId={ownSpecialistId}
                onClose={() => setSelected(null)}
                onChanged={handleChanged}
                showCloseControl={false}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
