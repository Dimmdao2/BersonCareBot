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

/** Альтернатива колонке «тип нагрузки»: свой справочник и имя GET-параметра (например область рекомендаций — `domain`). */
export type DoctorCatalogTertiaryFilter = {
  items: ReferenceItemDto[];
  paramName: string;
  value: string | null;
  label: string;
  placeholder: string;
  clearLabel: string;
  /** Подпись в строке под фильтрами («Регион: … · …»). */
  summaryLabel: string;
};

export type DoctorCatalogFiltersFormProps = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  /** Если задано, третья колонка — не тип нагрузки, а этот список (напр. область рекомендации). */
  tertiaryFilter?: DoctorCatalogTertiaryFilter;
  view?: "tiles" | "list";
  titleSort?: "asc" | "desc" | null;
  selectedId?: string | null;
  idPrefix?: string;
  /** Редко: доп. контроль слева (без фильтров по черновикам/архиву в статусе шаблона). */
  leadingSlot?: ReactNode;
};

function customTertiaryTitle(items: ReferenceItemDto[], code: string | null): string {
  if (!code) return "";
  return items.find((i) => i.code === code)?.title ?? "";
}

/**
 * Общая GET-форма каталога врача: поиск + регион + третья колонка
 * (по умолчанию тип нагрузки упражнения; иначе {@link DoctorCatalogTertiaryFilter}) + «Применить».
 */
export function DoctorCatalogFiltersForm({
  q,
  regionRefId,
  loadType,
  tertiaryFilter,
  view,
  titleSort,
  selectedId,
  idPrefix = "catalog",
  leadingSlot,
}: DoctorCatalogFiltersFormProps) {
  const [selectedRegionRefId, setSelectedRegionRefId] = useState<string | null>(regionRefId ?? null);
  const [selectedRegionLabel, setSelectedRegionLabel] = useState("");
  const [selectedExerciseLoad, setSelectedExerciseLoad] = useState<string | null>(loadType ?? null);
  const [exerciseLoadLabel, setExerciseLoadLabel] = useState(() => loadTypeTitle(loadType));
  const [selectedCustomTertiary, setSelectedCustomTertiary] = useState<string | null>(
    tertiaryFilter?.value ?? null,
  );
  const [customTertiaryLabel, setCustomTertiaryLabel] = useState(() =>
    tertiaryFilter ? customTertiaryTitle(tertiaryFilter.items, tertiaryFilter.value) : "",
  );
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setSelectedRegionRefId(regionRefId ?? null);
    setSelectedRegionLabel("");
  }, [regionRefId]);

  useEffect(() => {
    setSelectedExerciseLoad(loadType ?? null);
    setExerciseLoadLabel(loadTypeTitle(loadType));
  }, [loadType]);

  useEffect(() => {
    if (!tertiaryFilter) return;
    setSelectedCustomTertiary(tertiaryFilter.value ?? null);
    setCustomTertiaryLabel(customTertiaryTitle(tertiaryFilter.items, tertiaryFilter.value));
  }, [tertiaryFilter]);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  const tertiarySummary = tertiaryFilter
    ? customTertiaryLabel
      ? `${tertiaryFilter.summaryLabel}: ${customTertiaryLabel}`
      : ""
    : exerciseLoadLabel
      ? `Тип нагрузки: ${exerciseLoadLabel}`
      : "";

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
        {tertiaryFilter ? (
          <>
            <label className="sr-only" htmlFor={`${idPrefix}-${tertiaryFilter.paramName}`}>
              {tertiaryFilter.label}
            </label>
            <ReferenceSelect
              id={`${idPrefix}-${tertiaryFilter.paramName}`}
              name={tertiaryFilter.paramName}
              prefetchedItems={tertiaryFilter.items}
              valueMatch="code"
              submitField="code"
              value={selectedCustomTertiary}
              onChange={(code, label) => {
                setSelectedCustomTertiary(code);
                setCustomTertiaryLabel(code ? label : "");
              }}
              placeholder={tertiaryFilter.placeholder}
              clearOptionLabel={tertiaryFilter.clearLabel}
            />
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`${idPrefix}-load`}>
              Тип нагрузки
            </label>
            <ReferenceSelect
              id={`${idPrefix}-load`}
              name="load"
              prefetchedItems={EXERCISE_LOAD_FILTER_ITEMS}
              valueMatch="code"
              submitField="code"
              value={selectedExerciseLoad}
              onChange={(code, label) => {
                setSelectedExerciseLoad(code);
                setExerciseLoadLabel(code ? label : "");
              }}
              placeholder="Все типы"
              clearOptionLabel="Все типы"
            />
          </>
        )}
      </div>
      <Button type="submit" variant="secondary" className="box-border h-[32px] shrink-0 px-3 py-0 text-sm leading-none">
        Применить
      </Button>
      {selectedRegionLabel || tertiarySummary ? (
        <p className="w-full text-xs text-muted-foreground">
          {[selectedRegionLabel ? `Регион: ${selectedRegionLabel}` : null, tertiarySummary || null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
