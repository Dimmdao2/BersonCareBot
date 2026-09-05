'use client';

import { useState, useEffect } from 'react';
import { patientCardHref } from './patients/patientCardHref';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorCalendarEventPanel } from './calendar/DoctorCalendarEventPanel';
import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
  CalendarEvent,
} from '@/modules/booking-calendar/types';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import type {
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';

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

type Props = {
  apptId: string | null;
  todayIso: string;
  displayIana: string;
  onClose: () => void;
  onChanged?: () => void;
};

type CalendarApiResponse = {
  ok: boolean;
  events?: CalendarEvent[];
  filters?: CalendarFilterMeta;
  resolvedScope?: ResolvedDoctorScheduleScope;
  error?: string;
};

export function TodayAppointmentFullModal({
  apptId,
  todayIso,
  displayIana,
  onClose,
  onChanged,
}: Props) {
  const [event, setEvent] = useState<CalendarAppointmentEvent | null>(null);
  const [filterMeta, setFilterMeta] = useState<CalendarFilterMeta>(EMPTY_FILTER_META);
  const [ownSpecialistId, setOwnSpecialistId] = useState<string | null>(null);
  const [clinicSpecialists, setClinicSpecialists] = useState<
    DoctorScheduleSpecialistOption[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    if (!apptId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard reset: clears stale event synchronously when apptId becomes null
      setEvent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ view: 'day', from: todayIso, to: todayIso }).toString();
    fetch(`${API_BASE}/calendar?${qs}`)
      .then((r) => r.json())
      .then((data: CalendarApiResponse) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.events)) {
          const found = data.events.find(
            (e): e is CalendarAppointmentEvent => e.kind === 'appointment' && e.id === apptId,
          );
          if (found) setEvent(found);
        }
        if (data.filters) setFilterMeta(data.filters);
        setOwnSpecialistId(data.resolvedScope?.ownSpecialistId ?? null);
        setClinicSpecialists(data.resolvedScope?.specialists ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apptId, todayIso, refetch]);

  function handleChanged() {
    onClose();
    onChanged?.();
    setRefetch((n) => n + 1);
  }

  function handleUpdated(updated?: CalendarAppointmentEvent) {
    if (updated) setEvent(updated);
    else setRefetch((n) => n + 1);
    onChanged?.();
  }

  return (
    <DoctorModal
      open={apptId !== null}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label="Запись на приём"
          patientName={event?.patientName ?? undefined}
          patientHref={event?.platformUserId ? patientCardHref(event.platformUserId) : null}
        />
      }
      size="lg"
      desktopPresentation="right-sheet"
    >
      {loading ? (
        <DoctorPanelLoading className="min-h-32" />
      ) : event ? (
        <DoctorCalendarEventPanel
          apiBase={API_BASE}
          selected={event}
          timeZone={displayIana}
          filterMeta={filterMeta}
          activeFilters={EMPTY_ACTIVE_FILTERS}
          ownSpecialistId={ownSpecialistId}
          clinicSpecialists={clinicSpecialists}
          onClose={onClose}
          onChanged={handleChanged}
          onUpdated={handleUpdated}
          flushChrome
        />
      ) : apptId ? (
        <div className="py-4 text-sm text-muted-foreground">Запись не найдена</div>
      ) : null}
    </DoctorModal>
  );
}
