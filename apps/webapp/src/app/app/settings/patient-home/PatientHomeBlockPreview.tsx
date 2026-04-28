"use client";

import type { PatientHomeBlockItem } from "@/modules/patient-home/ports";

type KnownRefs = {
  contentPages: string[];
  contentSections: string[];
  courses: string[];
};

function isResolved(item: PatientHomeBlockItem, refs: KnownRefs): boolean {
  if (item.targetType === "static_action") return true;
  if (item.targetType === "content_page") return refs.contentPages.includes(item.targetRef);
  if (item.targetType === "content_section") return refs.contentSections.includes(item.targetRef);
  return refs.courses.includes(item.targetRef);
}

export function PatientHomeBlockPreview({
  items,
  knownRefs,
}: {
  items: PatientHomeBlockItem[];
  knownRefs: KnownRefs;
}) {
  const visibleItems = items.filter((item) => item.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  if (visibleItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
        Нет видимых элементов.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {visibleItems.map((item) => {
        const resolved = isResolved(item, knownRefs);
        const title = item.titleOverride ?? item.targetRef;
        return (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-card p-3"
            data-testid="patient-home-preview-item"
          >
            <div className="text-sm font-medium">{title}</div>
            {item.subtitleOverride ? (
              <div className="mt-1 text-xs text-muted-foreground">{item.subtitleOverride}</div>
            ) : null}
            {!resolved ? (
              <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Warning: target не найден и не будет показан на клиентской главной.
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
