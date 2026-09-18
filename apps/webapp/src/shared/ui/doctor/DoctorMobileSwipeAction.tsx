'use client';

import type { ReactNode, TouchEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const ACTION_WIDTH = 72;
const ACTION_THRESHOLD = 44;

type DragState = {
  startX: number;
  startY: number;
  horizontal: boolean;
  fired: boolean;
};

export function DoctorMobileSwipeAction({
  children,
  action,
  actionLabel,
  disabled = false,
  onAction,
  className,
  as = 'div',
}: {
  children: ReactNode;
  action: ReactNode;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void | Promise<void>;
  className?: string;
  as?: 'div' | 'li';
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const sync = () => setTouchEnabled(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const enabled = touchEnabled && !disabled;
  const reset = () => {
    dragRef.current = null;
    setDragging(false);
    setOffset(0);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const touch = event.touches[0];
    if (!touch) return;
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
      fired: false,
    };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const touch = event.touches[0];
    if (!enabled || !drag || !touch) return;
    const dx = touch.clientX - drag.startX;
    const dy = touch.clientY - drag.startY;
    if (!drag.horizontal) {
      if (Math.abs(dy) > Math.abs(dx) || Math.abs(dy) > 10) {
        reset();
        return;
      }
      if (dx > -8) return;
      drag.horizontal = true;
      setDragging(true);
    }
    if (event.cancelable) event.preventDefault();
    setOffset(Math.max(-ACTION_WIDTH, Math.min(0, dx)));
  };

  const handleTouchEnd = () => {
    const drag = dragRef.current;
    const shouldAct = Boolean(enabled && drag?.horizontal && !drag.fired && offset <= -ACTION_THRESHOLD);
    if (drag?.horizontal) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 500);
    }
    if (drag) drag.fired = shouldAct;
    reset();
    if (shouldAct) {
      window.setTimeout(() => void onAction(), 180);
    }
  };

  const Container = as;
  return (
    <Container className={cn('relative overflow-hidden', className)}>
      {enabled ? (
        <div
          className={cn(
            'absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden bg-primary text-primary-foreground',
            !dragging && 'transition-[width] duration-150 ease-out',
          )}
          style={{ width: Math.abs(offset) }}
          aria-label={actionLabel}
          aria-hidden
        >
          {action}
        </div>
      ) : null}
      <div
        className={cn('relative z-[1]', !dragging && 'transition-transform duration-150 ease-out')}
        style={{ transform: `translateX(${offset}px)`, touchAction: enabled ? 'pan-y' : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={reset}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </Container>
  );
}
