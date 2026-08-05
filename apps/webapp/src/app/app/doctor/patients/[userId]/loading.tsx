import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';

export default function DoctorPatientCardLoading() {
  return (
    <div className={cn(doctorSectionCardClass, 'gap-3')} aria-busy="true">
      <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
      <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
      <span className="sr-only">Загрузка карточки пациента…</span>
    </div>
  );
}
