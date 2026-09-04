import { cn } from '@/lib/utils';

/** Compact inline marker for a patient who is currently on support. */
export function DoctorSupportStar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative -top-0.5 ml-1 inline-block text-[10px] leading-none font-semibold text-primary',
        className,
      )}
      title="На сопровождении"
      aria-label="На сопровождении"
    >
      ★
    </span>
  );
}
