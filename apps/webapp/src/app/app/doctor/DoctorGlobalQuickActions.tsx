'use client';

import { CalendarPlus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { DoctorNewClientAction } from '@/shared/ui/doctor/DoctorNewClientAction';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS,
  NAV_STRIP_ICON_STROKE,
} from '@/shared/ui/doctor/navChrome';
import { DoctorNewAppointmentModal } from './calendar/DoctorNewAppointmentModal';

export function DoctorGlobalQuickActions({
  patientSingularLabel,
}: {
  patientSingularLabel: string;
}) {
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  return (
    <>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS}
          aria-label="Новая запись"
          title="Новая запись"
          onClick={() => setAppointmentOpen(true)}
        >
          <CalendarPlus className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        </Button>
        <DoctorNewClientAction
          patientSingularLabel={patientSingularLabel}
          className={DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS}
          showIcon
          triggerIcon={
            <UserPlus className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          }
          compactOnMobile
          desktopPresentation="right-sheet"
        />
      </div>

      <DoctorNewAppointmentModal open={appointmentOpen} onClose={() => setAppointmentOpen(false)} />
    </>
  );
}
