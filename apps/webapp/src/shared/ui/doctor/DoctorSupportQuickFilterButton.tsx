'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { DoctorSupportStar } from '@/shared/ui/doctor/DoctorSupportStar';
import { DOCTOR_ACTIVE_FILTER_BUTTON_CLASS } from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type DoctorSupportQuickFilterButtonProps = {
  active: boolean;
  onClick: () => void;
  className?: string;
};

/** Square quick filter for the organization-defined support/favorites group. */
export function DoctorSupportQuickFilterButton({
  active,
  onClick,
  className,
}: DoctorSupportQuickFilterButtonProps) {
  const { supportGroupLabel } = useDoctorPatientTerms();

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      className={cn(
        'relative size-8 shrink-0',
        active && DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
        className,
      )}
      onClick={onClick}
      aria-label={`Только: ${supportGroupLabel}`}
      aria-pressed={active}
    >
      <DoctorSupportStar
        className={cn('top-0 ml-0 text-xs', active ? 'text-primary' : 'text-muted-foreground')}
      />
      <DoctorAttentionBadge count={active ? 1 : 0} dot />
    </Button>
  );
}
