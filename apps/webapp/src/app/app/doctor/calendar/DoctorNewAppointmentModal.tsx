'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CalendarFilterMeta } from '@/modules/booking-calendar/types';
import type {
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import type { CalendarPatientOption } from './DoctorCalendarPatientSearch';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

const API_BASE = '/api/doctor/booking-engine';

const EMPTY_FILTER_META: CalendarFilterMeta = {
  specialists: [],
  branches: [],
  rooms: [],
  services: [],
};

const EMPTY_ACTIVE_FILTERS = {
  specialistId: null,
  branchId: null,
  roomId: null,
  serviceId: null,
};

const DoctorCalendarEventPanel = dynamic(
  () => import('./DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

type CalendarApiResponse = {
  ok: boolean;
  filters?: CalendarFilterMeta;
  resolvedScope?: ResolvedDoctorScheduleScope;
  timeZone?: string;
};

type CreateContext = {
  filters: CalendarFilterMeta;
  ownSpecialistId: string | null;
  clinicSpecialists: DoctorScheduleSpecialistOption[] | null;
  timeZone: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  patient?: CalendarPatientOption | null;
  contextDate?: string;
  fallbackTimeZone?: string;
  title?: string;
};

/** Shared host for creating a schedule appointment from doctor screens. */
export function DoctorNewAppointmentModal({
  open,
  onClose,
  patient = null,
  contextDate,
  fallbackTimeZone = 'Europe/Moscow',
  title = 'Новая запись',
}: Props) {
  const router = useRouter();
  const [createContext, setCreateContext] = useState<CreateContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // scope=clinic отдаёт весь каталог специалистов клиники: у пользователя без прав на
    // чужие расписания сервер всё равно сузит его до собственного (APPT-FORM-07).
    const query = contextDate
      ? `?${new URLSearchParams({ view: 'day', from: contextDate, to: contextDate, scope: 'clinic' })}`
      : '?view=day&scope=clinic';
    void fetch(`${API_BASE}/calendar${query}`)
      .then((response) => response.json())
      .then((data: CalendarApiResponse) => {
        if (cancelled) return;
        if (!data.ok) {
          setLoadError('Не удалось подготовить форму записи.');
          return;
        }
        setCreateContext({
          filters: data.filters ?? EMPTY_FILTER_META,
          ownSpecialistId: data.resolvedScope?.ownSpecialistId ?? null,
          clinicSpecialists: data.resolvedScope?.specialists ?? null,
          timeZone: data.timeZone ?? fallbackTimeZone,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError('Не удалось подготовить форму записи.');
      });
    return () => {
      cancelled = true;
    };
  }, [contextDate, fallbackTimeZone, open]);

  function handleClose() {
    onClose();
    setCreateContext(null);
    setLoadError(null);
  }

  function handleChanged() {
    handleClose();
    router.refresh();
  }

  return (
    <DoctorModal
      open={open}
      onClose={handleClose}
      title={title}
      size="lg"
      desktopPresentation="right-sheet"
    >
      {loadError ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {loadError}
        </p>
      ) : createContext ? (
        <DoctorCalendarEventPanel
          apiBase={API_BASE}
          selected={null}
          timeZone={createContext.timeZone}
          filterMeta={createContext.filters}
          activeFilters={EMPTY_ACTIVE_FILTERS}
          ownSpecialistId={createContext.ownSpecialistId}
          clinicSpecialists={createContext.clinicSpecialists}
          createInitialSpecialistId={createContext.ownSpecialistId}
          createInitialPatient={patient}
          startInCreate
          flushChrome
          onClose={handleClose}
          onChanged={handleChanged}
        />
      ) : (
        <DoctorPanelLoading className="min-h-32" />
      )}
    </DoctorModal>
  );
}
