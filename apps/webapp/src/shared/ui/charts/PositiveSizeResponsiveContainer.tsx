'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
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
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const next = rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
    setSize((current) =>
      current?.width === next?.width && current?.height === next?.height ? current : next,
    );
  }, []);

  useEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host) return;
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(host);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div ref={hostRef} className={cn('h-full w-full min-w-0', className)}>
      {size ? <ResponsiveContainer {...props} width={size.width} height={size.height} /> : null}
    </div>
  );
}
