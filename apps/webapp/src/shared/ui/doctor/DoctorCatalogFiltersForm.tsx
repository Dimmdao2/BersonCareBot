"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { EXERCISE_LOAD_TYPE_OPTIONS, exerciseLoadTypeLabel } from "@/modules/lfk-exercises/exerciseLoadTypeOptions";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import type { ReactNode } from "react";

const EXERCISE_LOAD_FILTER_ITEMS: ReferenceItemDto[] = EXERCISE_LOAD_TYPE_OPTIONS.map((o, idx) => ({
  id: `ex-filter-load-${o.value}`,
  code: o.value,
  title: o.label,
  sortOrder: idx + 1,
}));

function loadTypeTitle(code: ExerciseLoadType | undefined): string {
  return exerciseLoadTypeLabel(code ?? "");
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
  /** Сохранять оси каталога с публикацией при GET submit (ЛФК / шаблоны программ / наборы тестов). */
  catalogPubArch?: DoctorCatalogPubArchQuery;
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
  catalogPubArch,
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
      {view ? <input type="hidden" name="catalogView" value={view} /> : null}
      {titleSort ? <input type="hidden" name="titleSort" value={titleSort} /> : null}
      {selectedId ? <input type="hidden" name="selected" value={selectedId} /> : null}
      {catalogPubArch?.arch === "archived" ? <input type="hidden" name="arch" value="archived" /> : null}
      {catalogPubArch?.pub === "draft" || catalogPubArch?.pub === "published" ? (
        <input type="hidden" name="pub" value={catalogPubArch.pub} />
      ) : null}
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
          name="regionRefId"
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
              showAllOnFocus
            />
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`${idPrefix}-load`}>
              Тип нагрузки
            </label>
            <ReferenceSelect
              id={`${idPrefix}-load`}
              name="loadType"
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
              showAllOnFocus
            />
          </>
        )}
      </div>
      <Button type="submit" variant="secondary" className="box-border h-[32px] shrink-0 px-3 py-0 text-sm leading-none">
        Применить
      </Button>
      {selectedRegionLabel || tertiarySummary ? (
        <p className="w-full text-xs text-muted-foreground">
          {[
            selectedRegionLabel ? `Регион: ${selectedRegionLabel}` : null,
            tertiarySummary || null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
