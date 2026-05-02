"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";
import { cn } from "@/lib/utils";

export type DoctorCatalogArchiveScopeSelectProps = {
  value: RecommendationListFilterScope;
  extraParams?: Record<string, string | null | undefined>;
  className?: string;
  triggerClassName?: string;
};

/** Компактный переключатель рабочий каталог / архив для левой панели, рядом с сортировкой. */
export function DoctorCatalogArchiveScopeSelect({
  value,
  extraParams,
  className,
  triggerClassName,
}: DoctorCatalogArchiveScopeSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selected = value === "archived" ? "archived" : "active";

  return (
    <div className={cn("flex w-[128px] max-w-[128px] shrink-0 min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] text-muted-foreground sm:sr-only">Архив</span>
      <Select
        value={selected}
        onValueChange={(next) => {
          const sp = new URLSearchParams(window.location.search);
          sp.delete("selected");
          if (next === "archived") sp.set("status", "archived");
          else sp.delete("status");
          for (const [key, val] of Object.entries(extraParams ?? {})) {
            if (val == null || val === "") sp.delete(key);
            else sp.set(key, val);
          }
          const qs = sp.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        <SelectTrigger size="sm" className={cn("w-full text-left", triggerClassName)}>
          <SelectValue>{selected === "archived" ? "Архив" : "Активные"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Активные</SelectItem>
          <SelectItem value="archived">Архив</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
