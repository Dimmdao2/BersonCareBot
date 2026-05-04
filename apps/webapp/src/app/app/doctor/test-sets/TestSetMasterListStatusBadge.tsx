"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TestSetPublicationStatus } from "@/modules/tests/types";

/** Бейдж статуса набора в master-списке (как у комплексов ЛФК / шаблонов программ). */
export function TestSetMasterListStatusBadge({
  publicationStatus,
  isArchived,
  className,
}: {
  publicationStatus: TestSetPublicationStatus;
  isArchived: boolean;
  className?: string;
}) {
  if (isArchived) {
    return (
      <Badge variant="destructive" className={cn("w-full justify-center text-[10px] leading-tight font-medium", className)} title="В архиве">
        В архиве
      </Badge>
    );
  }
  if (publicationStatus === "published") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "w-full justify-center text-[10px] leading-tight font-medium",
          "border-emerald-600/35 bg-emerald-600/12 text-emerald-900 dark:border-emerald-500/45 dark:bg-emerald-500/12 dark:text-emerald-50",
          className,
        )}
        title="Опубликован"
      >
        Опубликован
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={cn("w-full justify-center text-[10px] leading-tight font-medium", className)} title="Черновик">
      Черновик
    </Badge>
  );
}
