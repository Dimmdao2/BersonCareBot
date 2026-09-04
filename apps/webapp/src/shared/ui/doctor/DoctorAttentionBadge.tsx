import { cn } from '@/lib/utils';

type Props = {
  count?: number;
  dot?: boolean;
  className?: string;
};

/** One semantic-danger marker for doctor navigation and unread tab counts. */
export function DoctorAttentionBadge({ count = 0, dot = false, className }: Props) {
  if (!Number.isFinite(count) || count <= 0) return null;

  if (dot) {
    return (
      <span
        aria-hidden
        className={cn(
          // Центр точки лежит на правой верхней дуге обводки носителя.
          'size-1.5 rounded-full bg-destructive ring-1 ring-white',
          className,
        )}
        style={{ position: 'absolute', right: '-1px', top: '-1px' }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive tabular-nums',
        className,
      )}
    >
      {Math.floor(count)}
    </span>
  );
}
