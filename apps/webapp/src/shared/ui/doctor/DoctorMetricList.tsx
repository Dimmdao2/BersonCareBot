import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';
import { doctorStatCardGridClass } from '@/shared/ui/doctor/doctorVisual';

type DoctorMetricListProps = ComponentPropsWithoutRef<'div'> & {
  columns?: 'responsive' | 'two';
};

export function DoctorMetricList({
  className,
  columns = 'responsive',
  ...props
}: DoctorMetricListProps) {
  return (
    <div
      className={cn(
        columns === 'two' ? 'grid w-full grid-cols-2 gap-2 md:gap-2.5' : doctorStatCardGridClass,
        className,
      )}
      {...props}
    />
  );
}
