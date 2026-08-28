'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CalendarFilterMeta } from '@/modules/booking-calendar/types';
import type { ResolvedDoctorScheduleScope } from '@/modules/doctor-schedule/scope';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorNewClientAction } from '@/shared/ui/doctor/DoctorNewClientAction';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { cn } from '@/lib/utils';

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
  () => import('./calendar/DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

type CalendarApiResponse = {
  ok: boolean;
  filters?: CalendarFilterMeta;
  resolvedScope?: ResolvedDoctorScheduleScope;
  timeZone?: string;
  error?: string;
};

type CreateContext = {
  filters: CalendarFilterMeta;
  ownSpecialistId: string | null;
  timeZone: string;
};

type DoctorTodayQuickActionsProps = {
  todayIso: string;
  displayIana: string;
  placement: 'header' | 'mobile-footer';
};

/** Единый блок быстрых действий страницы «Сегодня». */
export function DoctorTodayQuickActions({
  todayIso,
  displayIana,
  placement,
}: DoctorTodayQuickActionsProps) {
  const router = useRouter();
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [createContext, setCreateContext] = useState<CreateContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!appointmentOpen) return;
    let cancelled = false;
    const qs = new URLSearchParams({ view: 'day', from: todayIso, to: todayIso }).toString();
    void fetch(`${API_BASE}/calendar?${qs}`)
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
          timeZone: data.timeZone ?? displayIana,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError('Не удалось подготовить форму записи.');
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentOpen, displayIana, todayIso]);

  function openAppointment() {
    setCreateContext(null);
    setLoadError(null);
    setAppointmentOpen(true);
  }

  function closeAppointment() {
    setAppointmentOpen(false);
    setLoadError(null);
  }

  function handleChanged() {
    closeAppointment();
    router.refresh();
  }

  return (
    <>
      {placement === 'mobile-footer' ? (
        <div className="h-[52px] shrink-0 md:hidden" aria-hidden />
      ) : null}
      <div
        className={cn(
          placement === 'mobile-footer'
            ? 'fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-30 grid grid-cols-2 gap-2 border-t border-border/60 px-3 py-2 md:hidden'
            : 'hidden grid-cols-2 items-center gap-2 md:grid',
          placement === 'mobile-footer' && DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
        )}
      >
        <Button
          type="button"
          size="sm"
          className={placement === 'mobile-footer' ? 'w-full' : undefined}
          onClick={openAppointment}
        >
          {placement === 'mobile-footer' ? 'Создать запись' : 'Новый визит'}
        </Button>
        <DoctorNewClientAction
          patientSingularLabel="Клиент"
          className={placement === 'mobile-footer' ? 'w-full' : undefined}
          showIcon={false}
          compactOnMobile={false}
          desktopPresentation="right-sheet"
        />
      </div>

      <DoctorModal
        open={appointmentOpen}
        onClose={closeAppointment}
        title="Создать запись"
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
            createInitialSpecialistId={createContext.ownSpecialistId}
            startInCreate
            showCloseControl={false}
            flushChrome={placement === 'header'}
            onClose={closeAppointment}
            onChanged={handleChanged}
          />
        ) : (
          <div className="h-32 animate-pulse rounded-lg bg-muted/40" aria-label="Загрузка" />
        )}
      </DoctorModal>
    </>
  );
}
