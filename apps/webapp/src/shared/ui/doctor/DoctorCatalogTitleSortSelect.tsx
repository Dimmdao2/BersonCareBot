'use client';

import { startTransition } from 'react';
import { usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { cn } from '@/lib/utils';
import { dispatchDoctorCatalogUrlSync } from '@/shared/lib/doctorCatalogClientUrlSync';

export type TitleSortValue = 'default' | 'asc' | 'desc';

export type DoctorCatalogTitleSortSelectProps = {
  value: TitleSortValue;
  onValueChange: (next: TitleSortValue) => void;
  /** Подпись над селектом на мобилке; на `sm+` скрыта (`sr-only`), как в каталоге упражнений. */
  label?: string;
  className?: string;
  triggerClassName?: string;
};

/**
 * Унифицированная сортировка по названию / по дате изменения для doctor CMS каталогов.
 *
 * Значение живёт в query (`titleSort`), а не в состоянии вызывающего компонента, и пишется тем же способом,
 * что остальные клиентские фильтры каталога: `history.replaceState` + `DOCTOR_CATALOG_URL_SYNC_EVENT`, без
 * `router.replace` и без RSC-рефетча. До 11.09 каталоги держали выбор в собственном `useState`, но список и
 * сама подпись контрола читались из `useDoctorCatalogClientFilterMerge`, который берёт `titleSort` ТОЛЬКО из
 * адреса, — состояние вызывающего перетиралось на том же рендере. Наблюдалось это так: пункт «Название А→Я»
 * выбирается, подпись остаётся «По дате изменения», порядок строк не меняется, а тот же `?titleSort=asc`,
 * введённый в адрес руками, сортирует правильно.
 */
export function DoctorCatalogTitleSortSelect({
  value,
  onValueChange,
  label = 'Сортировка',
  className,
  triggerClassName,
}: DoctorCatalogTitleSortSelectProps) {
  const pathname = usePathname();

  const applyTitleSort = (next: TitleSortValue) => {
    onValueChange(next);
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (next === 'default') sp.delete('titleSort');
    else sp.set('titleSort', next);
    const qs = sp.toString();
    window.history.replaceState(window.history.state, '', qs ? `${pathname}?${qs}` : pathname);
    startTransition(() => {
      dispatchDoctorCatalogUrlSync();
    });
  };

  return (
    <div className={cn('flex w-[160px] max-w-[160px] shrink-0 min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] text-muted-foreground sm:sr-only">{label}</span>
      <Select value={value} onValueChange={(v) => applyTitleSort(v as TitleSortValue)}>
        <SelectTrigger size="sm" className={cn('w-full text-left', triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">По дате изменения</SelectItem>
          <SelectItem value="asc">Название А→Я</SelectItem>
          <SelectItem value="desc">Название Я→А</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
