import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';

export default function DoctorSectionLoading() {
  return (
    <div className={cn(doctorSectionCardClass, 'm-3 gap-3')} aria-busy="true">
      <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted/70" />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
