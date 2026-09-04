'use client';

import {
  cloneElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  useState,
} from 'react';
import { DoctorModal, type DoctorModalDesktopPresentation } from './DoctorModal';
import { Button } from './primitives/button';
import { Input } from './primitives/input';
import { DoctorPanelLoading } from './DoctorPanelLoading';
import { DoctorDnaFlatList } from './DoctorDnaFlatListRow';
import { cn } from '@/lib/utils';

export type KpiQuickFilter<T> = {
  label: string;
  predicate: (item: T) => boolean;
};

export type KpiPreviewModalProps<T> = {
  open: boolean;
  onClose: () => void;
  /** Modal title, e.g. «Комментарии», «Записи сегодня» */
  title: string;
  /** Total count shown in header */
  count: number;
  /** Keep title concise when the count already belongs to the KPI card. */
  showCount?: boolean;
  /** Optional icon action in the canonical modal header. */
  headerAction?: ReactNode;
  /** Optional canonical bottom action panel. */
  footer?: ReactNode;
  /** Modals opened from this preview; preserves Base UI's nested drawer stack. */
  nestedModals?: ReactNode;
  /** List of entities to display */
  items: T[];
  /**
   * Renderer for each item. It owns the canonical direct `<li>` child of the
   * modal list; this modal only owns the list container and its scroll area.
   */
  renderItem: (item: T) => ReactElement<ComponentPropsWithoutRef<'li'>>;
  /** Optional: enable client-side text search */
  searchPlaceholder?: string;
  searchPredicate?: (item: T, query: string) => boolean;
  /** Optional: quick-filter chip buttons */
  quickFilters?: KpiQuickFilter<T>[];
  /** Empty state node */
  emptyState?: ReactNode;
  /** Whether data is still loading (shows skeleton) */
  loading?: boolean;
  desktopPresentation?: DoctorModalDesktopPresentation;
};

/**
 * Generic KPI → Preview Modal component.
 * Used by Сегодня KPI cards and (later) by Расписание KPI row (S2.3 Step 4).
 *
 * Pattern: open via KPI card click → see list + optional search + quick filters →
 * click item → navigate to patient/entity page.
 */
export function KpiPreviewModal<T>({
  open,
  onClose,
  title,
  count,
  showCount = true,
  headerAction,
  footer,
  nestedModals,
  items,
  renderItem,
  searchPlaceholder,
  searchPredicate,
  quickFilters,
  emptyState,
  loading = false,
  desktopPresentation,
}: KpiPreviewModalProps<T>) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<number | null>(null);

  // Reset filters when modal closes/re-opens
  const handleClose = () => {
    setQuery('');
    setActiveFilter(null);
    onClose();
  };

  // Client-side filtering
  let filtered = items;
  if (query.trim() && searchPredicate) {
    filtered = filtered.filter((item) => searchPredicate(item, query.trim()));
  }
  if (activeFilter !== null && quickFilters?.[activeFilter]) {
    filtered = filtered.filter(quickFilters[activeFilter].predicate);
  }

  const hasSearch = Boolean(searchPlaceholder && searchPredicate);
  const hasQuickFilters = Boolean(quickFilters && quickFilters.length > 0);

  return (
    <DoctorModal
      open={open}
      onClose={handleClose}
      title={
        <span>
          {title}
          {showCount && count > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>
          ) : null}
        </span>
      }
      size="lg"
      bodyVariant="list"
      desktopPresentation={desktopPresentation}
      headerAction={headerAction}
      footer={footer}
    >
      <>
        {/* Search */}
        {hasSearch || hasQuickFilters ? (
          <div className="flex flex-col gap-3 px-4 pt-3 pb-3">
            {hasSearch ? (
              <Input
                type="search"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9"
                aria-label="Поиск"
              />
            ) : null}

            {/* Quick filter chips */}
            {hasQuickFilters && quickFilters ? (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    activeFilter === null
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                  )}
                >
                  Все
                </Button>
                {quickFilters.map((f, idx) => (
                  <Button
                    key={f.label}
                    type="button"
                    onClick={() => setActiveFilter(activeFilter === idx ? null : idx)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      activeFilter === idx
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <DoctorPanelLoading className="min-h-32 px-4" />
        ) : filtered.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-4">
            {emptyState ?? (
              <p className="py-4 text-center text-sm text-muted-foreground">Нет элементов</p>
            )}
          </div>
        ) : (
          <DoctorDnaFlatList>
            {filtered.map((item, idx) =>
              // biome-ignore lint/suspicious/noArrayIndexKey: caller owns the row, modal owns its stable list position
              cloneElement(renderItem(item), { key: idx }),
            )}
          </DoctorDnaFlatList>
        )}
        {nestedModals}
      </>
    </DoctorModal>
  );
}
