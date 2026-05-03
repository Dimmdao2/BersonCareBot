"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { applyDoctorCatalogPubArchToSearchParams } from "@/shared/lib/doctorCatalogListStatus";
import { cn } from "@/lib/utils";

export type CatalogStatusFiltersProps = {
  value: DoctorCatalogPubArchQuery;
  extraParams?: Record<string, string | null | undefined>;
  className?: string;
};

/** Два селекта рядом: архив × публикация (`arch`, `pub` в query; legacy `status` сбрасывается). */
export function CatalogStatusFilters({ value, extraParams, className }: CatalogStatusFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const pushNext = (next: DoctorCatalogPubArchQuery) => {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    sp.delete("selected");
    applyDoctorCatalogPubArchToSearchParams(sp, next);
    for (const [key, val] of Object.entries(extraParams ?? {})) {
      if (val == null || val === "") sp.delete(key);
      else sp.set(key, val);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="flex w-[128px] max-w-[128px] shrink-0 min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground sm:sr-only">Архив</span>
        <Select
          value={value.arch}
          onValueChange={(v) => {
            if (v !== "active" && v !== "archived") return;
            pushNext({ arch: v, pub: value.pub });
          }}
        >
          <SelectTrigger size="sm" className="w-full text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-[148px] max-w-[148px] shrink-0 min-w-0 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground sm:sr-only">Публикация</span>
        <Select
          value={value.pub}
          onValueChange={(v) => {
            if (v !== "all" && v !== "draft" && v !== "published") return;
            pushNext({ arch: value.arch, pub: v });
          }}
        >
          <SelectTrigger size="sm" className="w-full text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="draft">Черновики</SelectItem>
            <SelectItem value="published">Опубликованные</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
