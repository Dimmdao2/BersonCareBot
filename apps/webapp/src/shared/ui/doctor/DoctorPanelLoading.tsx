import { Loader } from 'lucide-react';
import { cn } from '@/lib/utils';

type DoctorPanelLoadingProps = {
  className?: string;
  label?: string;
};

/** Centered loading state for doctor lists, panels and route transitions. */
export function DoctorPanelLoading({
  className,
  label = 'Загрузка…',
}: DoctorPanelLoadingProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <span>{label}</span>
      <Loader className="size-4 shrink-0 animate-spin" aria-hidden />
    </div>
  );
}

/** One route-level loading state for the entire doctor workspace. */
export function DoctorPageLoading() {
  return <DoctorPanelLoading className="min-h-48 w-full p-6" />;
}
