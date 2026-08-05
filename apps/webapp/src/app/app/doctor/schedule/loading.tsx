import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';

export default function DoctorScheduleLoading() {
  return (
    <div className={cn(doctorSectionCardClass, 'm-3 gap-3')} aria-busy="true">
      <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-full bg-muted/70" />
        <div className="h-8 w-28 animate-pulse rounded-full bg-muted/70" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-muted/70" />
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-muted/70" />
      <span className="sr-only">Загрузка расписания…</span>
    </div>
  );
}
