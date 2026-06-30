"use client";

import { type ReactNode, useState } from "react";
import { DoctorModal } from "./DoctorModal";
import { Input } from "./primitives/input";
import { cn } from "@/lib/utils";

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
  /** List of entities to display */
  items: T[];
  /** Renderer for each item */
  renderItem: (item: T) => ReactNode;
  /** Optional: enable client-side text search */
  searchPlaceholder?: string;
  searchPredicate?: (item: T, query: string) => boolean;
  /** Optional: quick-filter chip buttons */
  quickFilters?: KpiQuickFilter<T>[];
  /** Empty state node */
  emptyState?: ReactNode;
  /** Whether data is still loading (shows skeleton) */
  loading?: boolean;
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
  items,
  renderItem,
  searchPlaceholder,
  searchPredicate,
  quickFilters,
  emptyState,
  loading = false,
}: KpiPreviewModalProps<T>) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<number | null>(null);

  // Reset filters when modal closes/re-opens
  const handleClose = () => {
    setQuery("");
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
          {count > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>
          ) : null}
        </span>
      }
      size="lg"
    >
      <div className="flex flex-col gap-3">
        {/* Search */}
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
            <button
              type="button"
              onClick={() => setActiveFilter(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              Все
            </button>
            {quickFilters.map((f, idx) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setActiveFilter(activeFilter === idx ? null : idx)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  activeFilter === idx
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* Scrollable list */}
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            emptyState ?? (
              <p className="py-4 text-center text-sm text-muted-foreground">Нет элементов</p>
            )
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {filtered.map((item, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: renderItem is opaque
                <li key={idx}>{renderItem(item)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DoctorModal>
  );
}
