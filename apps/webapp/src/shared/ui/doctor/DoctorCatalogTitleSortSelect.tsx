"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TitleSortValue = "default" | "asc" | "desc";

export type DoctorCatalogTitleSortSelectProps = {
  value: TitleSortValue;
  onValueChange: (next: TitleSortValue) => void;
  /** Подпись над селектом на мобилке; на `sm+` скрыта (`sr-only`), как в каталоге упражнений. */
  label?: string;
  className?: string;
  triggerClassName?: string;
};

/** Унифицированная сортировка по названию / по дате изменения для doctor CMS каталогов. */
export function DoctorCatalogTitleSortSelect({
  value,
  onValueChange,
  label = "Сортировка",
  className,
  triggerClassName,
}: DoctorCatalogTitleSortSelectProps) {
  return (
    <div
      className={cn(
        "flex w-[160px] max-w-[160px] shrink-0 min-w-0 flex-col gap-1",
        className,
      )}
    >
      <span className="text-[11px] text-muted-foreground sm:sr-only">{label}</span>
      <Select value={value} onValueChange={(v) => onValueChange(v as TitleSortValue)}>
        <SelectTrigger size="sm" className={cn("w-full text-left", triggerClassName)}>
          <SelectValue>
            {value === "asc" ? "Название А→Я" : value === "desc" ? "Название Я→А" : "Сортировка"}
          </SelectValue>
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
