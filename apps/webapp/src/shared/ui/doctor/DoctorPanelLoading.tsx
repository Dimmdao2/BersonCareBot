import { Loader } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Centered loading state for doctor lists and panels. */
export function DoctorPanelLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <span>Загрузка …</span>
      <Loader className="size-4 shrink-0 animate-spin" aria-hidden />
    </div>
  );
}
