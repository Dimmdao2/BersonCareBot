'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { CalendarFilterMeta } from '@/modules/booking-calendar/types';
import type {
  DoctorScheduleSpecialistOption,
  ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import type { CalendarPatientOption } from './DoctorCalendarPatientSearch';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';

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
  title?: ReactNode;
  patientOnSupport?: boolean;
  patientVariant?: 'link' | 'context';
  onChanged?: () => void;
};

/** Shared host for creating a schedule appointment from doctor screens. */
export function DoctorNewAppointmentModal({
  open,
  onClose,
  patient = null,
  contextDate,
  fallbackTimeZone = 'Europe/Moscow',
  title = 'Новая запись',
  patientOnSupport = false,
  patientVariant = 'link',
  onChanged,
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
    onChanged?.();
    router.refresh();
  }

  const patientName = patient
    ? formatDoctorFioShort(
        {
          lastName: patient.lastName ?? null,
          firstName: patient.firstName ?? null,
          patronymic: patient.patronymic ?? null,
        },
        patient.displayName,
      )
    : null;

  return (
    <DoctorModal
      open={open}
      onClose={handleClose}
      title={
        patient && patientName ? (
          <DoctorModalStackedTitle
            label={title}
            patientName={patientName}
            patientHref={patient.id ? patientCardHref(patient.id) : null}
            patientOnSupport={patientOnSupport}
            patientVariant={patientVariant}
          />
        ) : (
          title
        )
      }
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
          hideCreatePatient={Boolean(patient)}
          onClose={handleClose}
          onChanged={handleChanged}
        />
      ) : (
        <DoctorPanelLoading className="min-h-32" />
      )}
    </DoctorModal>
  );
}
