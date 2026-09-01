import { cn } from '@/lib/utils';

type Props = {
  count?: number;
  active?: boolean;
  dot?: boolean;
  className?: string;
};

/** One semantic-danger marker for doctor navigation and unread tab counts. */
export function DoctorAttentionBadge({ count = 0, active = false, dot = false, className }: Props) {
  if (!Number.isFinite(count) || count <= 0) return null;

  if (dot) {
    return (
      <span
        aria-hidden
        className={cn(
          'absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background',
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums',
        active ? 'bg-destructive text-destructive-foreground' : 'bg-destructive/10 text-destructive',
        className,
      )}
    >
      {Math.floor(count)}
    </span>
  );
}
