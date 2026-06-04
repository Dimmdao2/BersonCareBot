"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
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
  const rowCount = Math.ceil(items.length / safeColumns);

  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack virtualizer is an intended integration here
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: overscan ?? 2,
    measureElement,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className={cn("relative overflow-y-auto", containerClassName)}>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={cn(
                "absolute grid w-full gap-3 p-0.5",
                gridClassName,
              )}
              style={{
                top: virtualRow.start,
                gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: safeColumns }).map((_, col) => {
                const index = virtualRow.index * safeColumns + col;
                const item = items[index];
                if (!item) return <div key={`spacer-${virtualRow.index}-${col}`} aria-hidden />;
                return <div key={keyExtractor(item)}>{renderItem(item, index)}</div>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
