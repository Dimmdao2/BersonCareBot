"use client";

import { Button } from "@/components/ui/button";
import type { PatientHomeBlockItem } from "@/modules/patient-home/ports";
import {
  type KnownPatientHomeRefs,
  isPatientHomeItemResolved,
} from "@/modules/patient-home/patientHomeUnresolvedRefs";

export function PatientHomeBlockPreview({
  items,
  knownRefs,
  onRepairClick,
}: {
  items: PatientHomeBlockItem[];
  knownRefs: KnownPatientHomeRefs;
  onRepairClick?: () => void;
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
        const resolved = isPatientHomeItemResolved(item, knownRefs);
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
              <div className="mt-2 flex flex-col gap-2 text-xs text-amber-700 dark:text-amber-400">
                <span>Цель не найдена в CMS и не будет показана на главной пациента.</span>
                {onRepairClick ?
                  <div>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onRepairClick}>
                      Исправить связь CMS…
                    </Button>
                  </div>
                : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
