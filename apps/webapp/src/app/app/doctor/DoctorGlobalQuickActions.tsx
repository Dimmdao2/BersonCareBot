'use client';

import { CalendarPlus, ListPlus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { DoctorNewClientAction } from '@/shared/ui/doctor/DoctorNewClientAction';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS,
  NAV_STRIP_ICON_STROKE,
} from '@/shared/ui/doctor/navChrome';
import { DoctorNewAppointmentModal } from './calendar/DoctorNewAppointmentModal';
import { SpecialistTaskFormDialog } from './clients/SpecialistTaskFormDialog';

export function DoctorGlobalQuickActions({
  patientSingularLabel,
}: {
  patientSingularLabel: string;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  return (
    <>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS}
          aria-label="Новая задача"
          title="Новая задача"
          onClick={() => setTaskOpen(true)}
        >
          <ListPlus className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        </Button>
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

      <SpecialistTaskFormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        patientUserId=""
        editing={null}
        onSaved={() => setTaskOpen(false)}
      />
      <DoctorNewAppointmentModal
        open={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
      />
    </>
  );
}
