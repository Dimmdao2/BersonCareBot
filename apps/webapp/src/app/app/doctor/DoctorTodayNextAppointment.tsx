'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TodayNextAppointmentItem } from './loadDoctorTodayDashboard';
import { patientCardHref } from './patients/patientCardHref';
import { TodayAppointmentFullModal } from './TodayAppointmentFullModal';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { formatDoctorFioShortLabel } from '@/shared/lib/fio';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';

type Props = {
  appointment: TodayNextAppointmentItem | null;
  displayIana: string;
};

export function DoctorTodayNextAppointment({ appointment, displayIana }: Props) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const patientHref = appointment?.clientUserId ? patientCardHref(appointment.clientUserId) : null;
  const createVisitHref = appointment?.clientUserId
    ? patientCardHref(appointment.clientUserId, {
        tab: 'karta',
        createVisitFrom: appointment.id,
        visitDate: appointment.visitDate,
      })
    : null;
  const appointmentComment = appointment?.comment?.trim() || null;
  const patientLabel = appointment
    ? formatDoctorFioShortLabel(appointment.clientLabel, appointment.clientLabel)
    : null;

  return (
    <DoctorSection id="doctor-today-next-appointment">
      {appointment ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <DoctorSectionTitle>
                {appointment.isCurrent ? 'Сейчас на приеме' : 'Следующий прием'}
              </DoctorSectionTitle>
              <DoctorPatientName
                isOnSupport={appointment.patientOnSupport}
                className="min-w-0 truncate text-right text-[15px] font-medium text-primary"
              >
                {patientHref ? (
                  <Link
                    href={patientHref}
                    className="block truncate underline decoration-1 underline-offset-2"
                  >
                    {patientLabel}
                  </Link>
                ) : (
                  patientLabel
                )}
              </DoctorPatientName>
            </div>

            <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm">
              <p className="min-w-0 text-base font-medium tabular-nums">
                {appointment.dateTimeLabel}
              </p>
              {appointment.relativeLabel ? (
                <p className="shrink-0 font-medium">{appointment.relativeLabel}</p>
              ) : null}
            </div>

            {appointmentComment ? (
              <p className="mt-1 line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-sm leading-[18px]">
                <span className="text-muted-foreground">Комментарий: </span>
                {appointmentComment}
              </p>
            ) : null}
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full min-w-0 px-1 text-xs sm:px-3 sm:text-sm"
              onClick={() => setDetailsOpen(true)}
            >
              Детали записи
            </Button>
            {createVisitHref ? (
              <Link
                className={buttonVariants({
                  size: 'sm',
                  className: 'w-full min-w-0 px-1 text-xs sm:px-3 sm:text-sm',
                })}
                href={createVisitHref}
              >
                Начать приём
              </Link>
            ) : (
              <Button size="sm" className="w-full min-w-0 px-1 text-xs sm:px-3 sm:text-sm" disabled>
                Начать приём
              </Button>
            )}
          </div>
        </div>
      ) : (
        <DoctorSectionHeader>
          <DoctorSectionTitle>Следующий прием: нет записей</DoctorSectionTitle>
        </DoctorSectionHeader>
      )}

      <TodayAppointmentFullModal
        apptId={detailsOpen && appointment ? appointment.id : null}
        todayIso={appointment?.visitDate ?? ''}
        displayIana={displayIana}
        onClose={() => setDetailsOpen(false)}
        onChanged={() => router.refresh()}
      />
    </DoctorSection>
  );
}
