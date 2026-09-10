'use client';

import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSecondaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';

export type DoctorCatalogMasterListRowProps = {
  active: boolean;
  onPick: () => void;
  /** Содержимое полосы превью (30×30), без внешней обёртки — добавляется внутри `flex min-h-[30px] …`. */
  previewInner: ReactNode;
  title: string;
  /** Вторая строка под заголовком (счётчики и т.п.). */
  meta: ReactNode;
  /** Компактная отметка состояния справа. */
  badge: ReactNode;
};

/**
 * Строка master-списка каталога врача в общей геометрии плоских списков.
 */
export function DoctorCatalogMasterListRow({
  active,
  onPick,
  previewInner,
  title,
  meta,
  badge,
}: DoctorCatalogMasterListRowProps) {
  return (
    <div className="border-b border-[var(--doctor-flat-list-divider,#f0efeb)] last:border-b-0">
      <Button
        type="button"
        variant="ghost"
        onClick={onPick}
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          'h-auto min-h-0 w-full rounded-none bg-transparent text-left shadow-none',
        )}
      >
        {active ? <DoctorDnaFlatListSelectionStrip /> : null}
        <div className="flex min-h-[30px] shrink-0 flex-wrap content-center items-center gap-1">
          {previewInner}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              doctorDnaFlatListPrimaryClass,
              'line-clamp-2 whitespace-normal leading-snug',
              active && 'text-primary',
            )}
          >
            {title}
          </div>
          <div className={cn(doctorDnaFlatListSecondaryClass, 'truncate tabular-nums')}>{meta}</div>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center">{badge}</span>
      </Button>
    </div>
  );
}
