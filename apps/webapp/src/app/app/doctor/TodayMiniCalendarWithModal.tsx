'use client';

import { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import { Dialog, DialogContent } from '@/shared/ui/doctor/primitives/dialog';
import { DoctorCalendarEventPanel } from './calendar/DoctorCalendarEventPanel';
import { DoctorTodayMiniCalendar } from './DoctorTodayMiniCalendar';
import type { TodayAppointmentItem } from './loadDoctorTodayDashboard';
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
  nowMinutes?: number;
  todayDateLabel: string;
  displayIana: string;
  workingBounds?: { startMinute: number; endMinute: number } | null;
};

/**
 * Mini-calendar for «Сегодня» with a full appointment modal.
 *
 * Fetch canonical `CalendarAppointmentEvent` objects client-side (same API as
 * `ScheduleCalendarTab`) and pass the full event object directly to
 * `DoctorCalendarEventPanel` — no re-fetch, no cross-source ID mismatch.
 */
export function TodayMiniCalendarWithModal({
  appointments,
  nowMinutes,
  todayDateLabel,
  displayIana,
  workingBounds,
}: Props) {
  const [calendarEvents, setCalendarEvents] = useState<CalendarAppointmentEvent[]>([]);
  const [filterMeta, setFilterMeta] = useState<CalendarFilterMeta>(EMPTY_FILTER_META);
  const [ownSpecialistId, setOwnSpecialistId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);

  const todayIso =
    DateTime.now().setZone(displayIana).toISODate() ?? new Date().toISOString().slice(0, 10);

  /** Fetch canonical appointment events for today from the booking-engine calendar API. */
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

  // Fetch canonical calendar events on mount so FC uses canonical IDs.
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

  function handleChanged() {
    setSelected(null);
    // Re-fetch after an action (reschedule, cancel, etc.) to keep the calendar fresh.
    fetchTodayEvents();
  }

  return (
    <>
      <DoctorTodayMiniCalendar
        appointments={appointments}
        calendarEvents={calendarEvents}
        nowMinutes={nowMinutes}
        todayDateLabel={todayDateLabel}
        displayIana={displayIana}
        workingBounds={workingBounds}
        onCanonicalEventClick={(appt) => setSelected(appt)}
      />

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
