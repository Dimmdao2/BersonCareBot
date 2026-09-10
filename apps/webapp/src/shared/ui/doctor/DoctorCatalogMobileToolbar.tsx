'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dispatchDoctorCatalogUrlSync } from '@/shared/lib/doctorCatalogClientUrlSync';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorShellMobileBottomTabsRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';

const FILTER_PARAMS = [
  'q',
  'region',
  'load',
  'domain',
  'assessment',
  'titleSort',
  'status',
  'arch',
  'pub',
  'selected',
] as const;

export function DoctorCatalogMobileToolbar({
  search,
  filters,
  filterActive = false,
  viewMode,
  onToggleView,
  onCreate,
  createLabel,
}: {
  search: ReactNode;
  filters: ReactNode;
  filterActive?: boolean;
  viewMode?: 'tiles' | 'list';
  onToggleView?: () => void;
  onCreate: () => void;
  createLabel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const content = useMemo(
    () => (
      <div className="relative z-40 flex h-14 shrink-0 items-center gap-1.5 border-t border-border/70 bg-background/95 px-2 backdrop-blur-md shadow-[0_-2px_6px_rgba(15,23,42,0.08)] md:hidden">
        <div className="min-w-0 flex-1">{search}</div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn('relative size-9 shrink-0', filterActive && 'border-primary text-primary')}
          onClick={() => setFiltersOpen(true)}
          aria-label="Фильтры"
          title="Фильтры"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {filterActive ? (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
        {viewMode && onToggleView ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 shrink-0"
            onClick={onToggleView}
            aria-label={viewMode === 'tiles' ? 'Показать список' : 'Показать карточки'}
            title={viewMode === 'tiles' ? 'Список' : 'Карточки'}
          >
            {viewMode === 'tiles' ? (
              <List className="size-4" aria-hidden />
            ) : (
              <LayoutGrid className="size-4" aria-hidden />
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0"
          onClick={onCreate}
          aria-label={createLabel}
          title={createLabel}
        >
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>
    ),
    [createLabel, filterActive, onCreate, onToggleView, search, viewMode],
  );

  const resetFilters = () => {
    const params = new URLSearchParams(window.location.search);
    for (const key of FILTER_PARAMS) params.delete(key);
    const query = params.toString();
    setFiltersOpen(false);
    router.push(query ? `${pathname}?${query}` : pathname);
    dispatchDoctorCatalogUrlSync();
  };

  return (
    <>
      <DoctorShellMobileBottomTabsRegistration content={content} />
      <DoctorModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры"
        size="sm"
        footer={
          <Button type="button" variant="outline" onClick={resetFilters}>
            Сбросить фильтры
          </Button>
        }
      >
        <div className="flex flex-col gap-4">{filters}</div>
      </DoctorModal>
    </>
  );
}
