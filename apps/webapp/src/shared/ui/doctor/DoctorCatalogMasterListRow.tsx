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
  /**
   * Первая строка списка — у неё разделителя сверху нет. Разделитель висит именно сверху и именно по
   * порядковому номеру, потому что список виртуализован: каждая строка живёт в собственной абсолютно
   * позиционированной обёртке и является в ней единственным ребёнком, поэтому `last:`/`first:` совпадают
   * ВСЕГДА и молча стирают все разделители до единого. До 11.09 здесь стоял `last:border-b-0`, и списки
   * комплексов, наборов тестов, шаблонов программ и трёх каталогов шли вообще без линий между строками.
   */
  first?: boolean;
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
  first = false,
}: DoctorCatalogMasterListRowProps) {
  return (
    <div
      className={cn(
        'border-t border-[var(--doctor-flat-list-divider,#f0efeb)]',
        first && 'border-t-0',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onPick}
        className={cn(
          doctorDnaFlatListRowClass,
          doctorDnaFlatListClickableClass,
          // `justify-start` гасит `justify-center` из базового класса кнопки: без него содержимое вставало
          // по центру и миниатюры начинались с разного места в зависимости от длины заголовка.
          'h-auto min-h-0 w-full justify-start rounded-none bg-transparent text-left shadow-none',
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
