'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CatalogSplitLayoutProps = {
  left: ReactNode;
  right: ReactNode;
  mobileView: 'list' | 'detail';
  mobileBackSlot?: ReactNode;
  className?: string;
  /**
   * Tailwind class that sets the desktop grid-cols.
   * Defaults to "lg:grid-cols-2" — the historical equal-split behaviour.
   * Pass e.g. "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" for an asymmetric split.
   * ADDITIVE — existing callers that omit this prop are visually unchanged.
   */
  desktopColsClassName?: string;
  /**
   * Breakpoint where the split panes become a desktop grid.
   * Defaults to `lg`, preserving the catalog pattern used by existing callers.
   */
  splitFrom?: 'md' | 'lg';
};

export function CatalogSplitLayout({
  left,
  right,
  mobileView,
  mobileBackSlot,
  className,
  desktopColsClassName,
  splitFrom = 'lg',
}: CatalogSplitLayoutProps) {
  const splitFromMd = splitFrom === 'md';
  const resolvedDesktopColsClassName =
    desktopColsClassName ?? (splitFromMd ? 'md:grid-cols-2' : 'lg:grid-cols-2');

  return (
    <div
      className={cn(
        'relative min-h-[calc(100dvh_-_8rem)] overflow-hidden',
        splitFromMd
          ? 'md:grid md:min-h-0 md:items-stretch md:gap-3 md:overflow-x-hidden md:overflow-y-visible'
          : 'lg:grid lg:min-h-0 lg:items-stretch lg:gap-3 lg:overflow-x-hidden lg:overflow-y-visible',
        resolvedDesktopColsClassName,
        className,
      )}
    >
      <div
        className={cn(
          'absolute inset-0 overflow-y-auto transition-transform duration-300 ease-out',
          splitFromMd
            ? 'md:static md:flex md:min-h-0 md:min-w-0 md:flex-col md:overflow-visible md:translate-x-0'
            : 'lg:static lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col lg:overflow-visible lg:translate-x-0',
          mobileView === 'list' ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {left}
      </div>

      <div
        className={cn(
          'absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out',
          splitFromMd
            ? 'md:static md:z-auto md:flex md:min-h-0 md:min-w-0 md:flex-col md:overflow-visible md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:translate-x-0'
            : 'lg:static lg:z-auto lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col lg:overflow-visible lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:translate-x-0',
          mobileView === 'detail' ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className={splitFromMd ? 'md:hidden' : 'lg:hidden'}>{mobileBackSlot}</div>
        {right}
      </div>
    </div>
  );
}
