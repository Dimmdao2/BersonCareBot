'use client';

import type { AppointmentRecordStatus } from '@/modules/appointments/service';
import { cn } from '@/lib/utils';
import {
  patientBadgeDangerClass,
  patientBadgePrimaryClass,
  patientBadgeSuccessClass,
} from '@/shared/ui/patient/patientVisual';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/patient/primitives/tooltip';

type Props = {
  status: AppointmentRecordStatus;
  cancelReason?: string | null;
  /** Предстоящие: зелёный «Записан» для активных; в истории плашки только у отмены и переноса. */
  mode?: 'upcoming' | 'history';
};

const LABEL: Record<AppointmentRecordStatus, string> = {
  created: 'Создана',
  confirmed: 'Подтверждён',
  rescheduled: 'Перенос',
  cancelled: 'Отменён',
};

/**
 * Бейдж статуса. Для tooltip при отмене — обёрнут в `TooltipProvider` родителем (см. `CabinetUpcomingAppointments`).
 */
export function AppointmentStatusBadge({ status, cancelReason, mode = 'upcoming' }: Props) {
  if (mode === 'history' && status !== 'cancelled' && status !== 'rescheduled') {
    return null;
  }

  const isUpcomingBooked = mode === 'upcoming' && (status === 'created' || status === 'confirmed');
  const displayLabel = isUpcomingBooked ? 'Записан' : LABEL[status];

  const toneClass = isUpcomingBooked
    ? patientBadgeSuccessClass
    : status === 'cancelled'
      ? patientBadgeDangerClass
    : status === 'rescheduled'
        ? patientBadgePrimaryClass
        : patientBadgeSuccessClass;

  const inner = (
    <Badge
      variant="outline"
      className={cn('h-auto', toneClass)}
    >
      {displayLabel}
    </Badge>
  );

  if (status === 'cancelled' && cancelReason?.trim()) {
    return (
      <Tooltip>
        <TooltipTrigger className="inline-flex cursor-help border-0 bg-transparent p-0">
          {inner}
        </TooltipTrigger>
        <TooltipContent>{cancelReason}</TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}
