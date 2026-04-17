"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export type VirtualizedItemGridProps<T> = {
  items: T[];
  columns: number;
  estimatedRowHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
  containerClassName?: string;
  gridClassName?: string;
};

export function VirtualizedItemGrid<T>({
  items,
  columns,
  estimatedRowHeight,
  overscan,
  renderItem,
  keyExtractor,
  containerClassName,
  gridClassName,
}: VirtualizedItemGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const safeColumns = Math.max(1, columns);

  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack virtualizer is an intended integration here
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    lanes: safeColumns,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: overscan ?? 2,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className={cn("relative overflow-y-auto", containerClassName)}>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const lane = virtualRow.lane ?? (virtualRow.index % safeColumns);
          const widthPct = 100 / safeColumns;
          return (
            <div
              key={virtualRow.key}
              className={cn("absolute p-0.5", gridClassName)}
              style={{
                top: virtualRow.start,
                left: `${lane * widthPct}%`,
                width: `${widthPct}%`,
              }}
            >
              <div key={keyExtractor(item)}>{renderItem(item, virtualRow.index)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
