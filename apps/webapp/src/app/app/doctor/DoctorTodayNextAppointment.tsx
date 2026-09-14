'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TodayNextAppointmentItem } from './loadDoctorTodayDashboard';
import { TodayAppointmentFullModal } from './TodayAppointmentFullModal';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { formatDoctorFioShortLabel } from '@/shared/lib/fio';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';
import {
  doctorInteractiveSurfaceButtonClass,
  doctorStatCardChevronClass,
} from '@/shared/ui/doctor/doctorVisual';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { agreeWithAppointment } from '@/modules/system-settings/patientTerms';
import { cn } from '@/lib/utils';

type Props = {
  appointment: TodayNextAppointmentItem | null;
  displayIana: string;
};

export function DoctorTodayNextAppointment({ appointment, displayIana }: Props) {
  const router = useRouter();
  const terms = useDoctorPatientTerms();
  // «Следующий приём» / «Следующая тренировка» — определение согласуется с родом слова.
  const nextAppointmentTitle = `${agreeWithAppointment(terms, 'Следующий', 'Следующая')} ${terms.appointmentSingular}`;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const appointmentComment = appointment?.comment?.trim() || null;
  const patientLabel = appointment
    ? formatDoctorFioShortLabel(appointment.clientLabel, appointment.clientLabel)
    : null;

  return (
    <DoctorSection id="doctor-today-next-appointment">
      {appointment ? (
        // Вся карточка — одна кнопка: «Детали записи», «Начать приём»/созвон и переход на карточку
        // клиента живут внутри самой модалки, поэтому здесь они были дублями. Шеврон справа —
        // общий, тот же, что у КПИ-плиток, чтобы «сюда можно ткнуть» читалось одинаково везде.
        <Button
          type="button"
          variant="ghost"
          className={cn(
            doctorInteractiveSurfaceButtonClass,
            'w-full justify-start text-left',
          )}
          onClick={() => setDetailsOpen(true)}
          data-testid="today-next-appointment-open"
        >
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <DoctorSectionTitle>
                  {appointment.isCurrent
                    ? `Сейчас на ${terms.appointmentPrepositional}`
                    : nextAppointmentTitle}
                </DoctorSectionTitle>
                <DoctorPatientName
                  isOnSupport={appointment.patientOnSupport}
                  className="min-w-0 truncate text-right text-[15px] font-medium text-primary"
                >
                  {patientLabel}
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
            <ChevronRight className={doctorStatCardChevronClass} aria-hidden />
          </div>
        </Button>
      ) : (
        <DoctorSectionHeader>
          <DoctorSectionTitle>{nextAppointmentTitle}: нет записей</DoctorSectionTitle>
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
