import { cn } from '@/lib/utils';

type Props = {
  count?: number;
  dot?: boolean;
  tone?: 'danger' | 'primary';
  className?: string;
};

/** Shared semantic attention marker for doctor navigation and unread tab counts. */
export function DoctorAttentionBadge({
  count = 0,
  dot = false,
  tone = 'danger',
  className,
}: Props) {
  if (!Number.isFinite(count) || count <= 0) return null;

  if (dot) {
    return (
      <span
        aria-hidden
        className={cn(
          // Центр точки лежит на правой верхней дуге обводки носителя.
          'size-1.5 rounded-full ring-1 ring-white',
          tone === 'primary' ? 'bg-primary' : 'bg-destructive',
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
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums',
        tone === 'primary' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive',
        className,
      )}
    >
      {Math.floor(count)}
    </span>
  );
}
