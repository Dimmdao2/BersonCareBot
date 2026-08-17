'use client';

import { useCallback, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

type ResponsiveProps = ComponentProps<typeof ResponsiveContainer>;

/** Mounts Recharts only after its host has a real positive content box. */
export function PositiveSizeResponsiveContainer({
  width: _width,
  height: _height,
  className,
  ...props
}: ResponsiveProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  const getSnapshot = useCallback(() => {
    if (!host) return '';
    const rect = host.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? `${rect.width}:${rect.height}` : '';
  }, [host]);

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!host) return () => undefined;
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(notify);
        observer.observe(host);
        return () => observer.disconnect();
      }
      window.addEventListener('resize', notify);
      return () => window.removeEventListener('resize', notify);
    },
    [host],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const [measuredWidth, measuredHeight] = snapshot ? snapshot.split(':').map(Number) : [0, 0];
  const hasPositiveSize = measuredWidth > 0 && measuredHeight > 0;

  return (
    <div ref={setHost} className={cn('h-full w-full min-w-0', className)}>
      {hasPositiveSize ? (
        <ResponsiveContainer {...props} width={measuredWidth} height={measuredHeight} />
      ) : null}
    </div>
  );
}
