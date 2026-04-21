"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { ReactNode } from "react";

const EXERCISE_LOAD_FILTER_ITEMS: ReferenceItemDto[] = [
  { id: "ex-filter-load-strength", code: "strength", title: "Силовая", sortOrder: 1 },
  { id: "ex-filter-load-stretch", code: "stretch", title: "Растяжка", sortOrder: 2 },
  { id: "ex-filter-load-balance", code: "balance", title: "Баланс", sortOrder: 3 },
  { id: "ex-filter-load-cardio", code: "cardio", title: "Кардио", sortOrder: 4 },
  { id: "ex-filter-load-other", code: "other", title: "Другое", sortOrder: 5 },
];

function loadTypeTitle(code: ExerciseLoadType | undefined): string {
  if (!code) return "";
  return EXERCISE_LOAD_FILTER_ITEMS.find((i) => i.code === code)?.title ?? "";
}

export type DoctorCatalogFiltersFormProps = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  view?: "tiles" | "list";
  titleSort?: "asc" | "desc" | null;
  selectedId?: string | null;
  idPrefix?: string;
  /** Редко: доп. контроль слева (без фильтров по черновикам/архиву в статусе шаблона). */
  leadingSlot?: ReactNode;
};

/**
 * Общая GET-форма каталога врача — как «Упражнения»: поиск + регион + тип нагрузки + «Применить».
 */
export function DoctorCatalogFiltersForm({
  q,
  regionRefId,
  loadType,
  view,
  titleSort,
  selectedId,
  idPrefix = "catalog",
  leadingSlot,
}: DoctorCatalogFiltersFormProps) {
  const [selectedRegionRefId, setSelectedRegionRefId] = useState<string | null>(regionRefId ?? null);
  const [selectedRegionLabel, setSelectedRegionLabel] = useState("");
  const [selectedLoadCode, setSelectedLoadCode] = useState<string | null>(loadType ?? null);
  const [selectedLoadLabel, setSelectedLoadLabel] = useState(() => loadTypeTitle(loadType));
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setSelectedRegionRefId(regionRefId ?? null);
    setSelectedRegionLabel("");
  }, [regionRefId]);

  useEffect(() => {
    setSelectedLoadCode(loadType ?? null);
    setSelectedLoadLabel(loadTypeTitle(loadType));
  }, [loadType]);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      {titleSort ? <input type="hidden" name="titleSort" value={titleSort} /> : null}
      {selectedId ? <input type="hidden" name="selected" value={selectedId} /> : null}
      {leadingSlot}
      <div className="w-[220px] shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-q`}>
          Поиск по названию
        </label>
        <Input
          id={`${idPrefix}-q`}
          name="q"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Поиск по названию"
          className="w-full"
        />
      </div>
      <div className="w-40 shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-region`}>
          Регион
        </label>
        <ReferenceSelect
          id={`${idPrefix}-region`}
          name="region"
          categoryCode="body_region"
          value={selectedRegionRefId}
          onChange={(refId, label) => {
            setSelectedRegionRefId(refId);
            setSelectedRegionLabel(label);
          }}
          placeholder="Выберите регион"
          clearOptionLabel="Все регионы"
        />
      </div>
      <div className="w-40 shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-load`}>
          Тип нагрузки
        </label>
        <ReferenceSelect
          id={`${idPrefix}-load`}
          name="load"
          prefetchedItems={EXERCISE_LOAD_FILTER_ITEMS}
          valueMatch="code"
          submitField="code"
          value={selectedLoadCode}
          onChange={(code, label) => {
            setSelectedLoadCode(code);
            setSelectedLoadLabel(code ? label : "");
          }}
          placeholder="Все типы"
          clearOptionLabel="Все типы"
        />
      </div>
      <Button type="submit" variant="secondary" className="box-border h-[32px] shrink-0 px-3 py-0 text-sm leading-none">
        Применить
      </Button>
      {selectedRegionLabel || selectedLoadLabel ? (
        <p className="w-full text-xs text-muted-foreground">
          {[
            selectedRegionLabel ? `Регион: ${selectedRegionLabel}` : null,
            selectedLoadLabel ? `Тип нагрузки: ${selectedLoadLabel}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
