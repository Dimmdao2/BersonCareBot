'use client';

import { CalendarPlus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { DoctorNewClientAction } from '@/shared/ui/doctor/DoctorNewClientAction';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import { DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS } from '@/shared/ui/doctor/navChrome';
import { DoctorNewAppointmentModal } from './calendar/DoctorNewAppointmentModal';

type DoctorTodayQuickActionsProps = {
  todayIso: string;
  displayIana: string;
  placement: 'header' | 'mobile-header';
};

/** Единый блок быстрых действий страницы «Сегодня». */
export function DoctorTodayQuickActions({
  todayIso,
  displayIana,
  placement,
}: DoctorTodayQuickActionsProps) {
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  function openAppointment() {
    setAppointmentOpen(true);
  }

  function closeAppointment() {
    setAppointmentOpen(false);
  }

  return (
    <>
      <div
        className={cn(
          placement === 'mobile-header'
            ? 'flex items-center gap-0.5 md:hidden'
            : 'hidden grid-cols-2 items-center gap-2 md:grid',
        )}
      >
        <Button
          type="button"
          variant={placement === 'mobile-header' ? 'ghost' : 'default'}
          size={placement === 'mobile-header' ? 'icon' : 'sm'}
          className={
            placement === 'mobile-header' ? DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS : undefined
          }
          aria-label="Новый визит"
          title="Новый визит"
          onClick={openAppointment}
        >
          {placement === 'mobile-header' ? (
            <CalendarPlus className="size-[22px]" aria-hidden />
          ) : (
            'Новый визит'
          )}
        </Button>
        <DoctorNewClientAction
          patientSingularLabel="Клиент"
          className={
            placement === 'mobile-header' ? DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS : undefined
          }
          showIcon={placement === 'mobile-header'}
          triggerIcon={<UserPlus className="size-[22px]" aria-hidden />}
          compactOnMobile={placement === 'mobile-header'}
          desktopPresentation="right-sheet"
        />
      </div>

      <DoctorNewAppointmentModal
        open={appointmentOpen}
        onClose={closeAppointment}
        contextDate={todayIso}
        fallbackTimeZone={displayIana}
        title="Создать запись"
      />
    </>
  );
}
