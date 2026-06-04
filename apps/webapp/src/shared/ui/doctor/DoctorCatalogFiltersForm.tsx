"use client";

import type { ReactNode } from "react";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { ReferenceSelect } from "@/shared/ui/doctor/ReferenceSelect";
import { EXERCISE_LOAD_TYPE_CATEGORY_CODE } from "@/modules/lfk-exercises/exerciseLoadTypeReference";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { DOCTOR_CATALOG_FILTER_MISSING } from "@/shared/lib/doctorCatalogEmptyFieldFilter";
import { dispatchDoctorCatalogUrlSync } from "@/shared/lib/doctorCatalogClientUrlSync";
import { cn } from "@/lib/utils";

const Q_DEBOUNCE_MS = 350;

const missingRegionOption = { value: DOCTOR_CATALOG_FILTER_MISSING, label: "Без региона" };
const missingLoadOption = { value: DOCTOR_CATALOG_FILTER_MISSING, label: "Без типа" };

/** Альтернатива колонке «тип нагрузки»: свой справочник и имя GET-параметра (например область рекомендаций — `domain`). */
export type DoctorCatalogTertiaryFilter = {
  items: ReferenceItemDto[];
  paramName: string;
  value: string | null;
  label: string;
  placeholder: string;
  clearLabel: string;
  /** Подпись пункта «без значения» (по умолчанию «Без типа»). */
  missingValueLabel?: string;
  /** Зарезервировано для подписей вне формы (строка под фильтрами удалена). */
  summaryLabel: string;
};

export type DoctorCatalogToolbarLayout = "compact" | "expanded";

export type DoctorCatalogFiltersFormProps = {
  q: string;
  /** Код `reference_items.code` категории `body_region` (в URL `?region=`). */
  regionCode?: string;
  loadType?: ExerciseLoadType | string;
  /** Если false — колонка «Регион» скрыта (синхронизация `?region=` не используется). */
  showRegionFilter?: boolean;
  /** Если false — колонка «Тип нагрузки» скрыта (только когда нет `tertiaryFilter`). */
  showLoadFilter?: boolean;
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
  /** Синхронизация высоты split-pane: всегда одна строка фильтров (`compact`). */
  onFilterToolbarLayoutChange?: (layout: DoctorCatalogToolbarLayout) => void;
};

function applyParamsPatch(sp: URLSearchParams, patch: Record<string, string | null | undefined>): URLSearchParams {
  const next = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  return next;
}

/**
 * Общая панель фильтров каталога врача: быстрый поиск по названию (debounce → URL) +
 * регион и третья колонка применяются сразу при выборе. Без кнопки «Применить».
 */
export function DoctorCatalogFiltersForm({
  q,
  regionCode,
  loadType,
  showRegionFilter = true,
  showLoadFilter = true,
  tertiaryFilter,
  view,
  titleSort,
  selectedId,
  idPrefix = "catalog",
  catalogPubArch,
  leadingSlot,
  onFilterToolbarLayoutChange,
}: DoctorCatalogFiltersFormProps) {
  const pathname = usePathname();

  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(regionCode ?? null);
  const [selectedExerciseLoad, setSelectedExerciseLoad] = useState<string | null>(loadType ?? null);
  const [selectedCustomTertiary, setSelectedCustomTertiary] = useState<string | null>(
    tertiaryFilter?.value ?? null,
  );
  const [qInput, setQInput] = useState(q);

  const qInputRef = useRef(qInput);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFilterToolbarLayoutChangeRef = useRef(onFilterToolbarLayoutChange);

  useEffect(() => {
    onFilterToolbarLayoutChangeRef.current = onFilterToolbarLayoutChange;
  }, [onFilterToolbarLayoutChange]);

  useEffect(() => {
    onFilterToolbarLayoutChangeRef.current?.("compact");
  }, []);

  useEffect(() => {
    qInputRef.current = qInput;
  }, [qInput]);

  const replaceSearch = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (typeof window === "undefined") return;
      window.history.replaceState(window.history.state, "", url);
      startTransition(() => {
        dispatchDoctorCatalogUrlSync();
      });
    },
    [pathname],
  );

  const mergeWorkspaceInto = useCallback(
    (sp: URLSearchParams) => {
      if (view) sp.set("view", view);
      else sp.delete("view");

      if (titleSort) sp.set("titleSort", titleSort);
      else sp.delete("titleSort");

      if (selectedId) sp.set("selected", selectedId);
      else sp.delete("selected");

      if (catalogPubArch?.arch === "archived") sp.set("arch", "archived");
      else sp.delete("arch");

      if (catalogPubArch?.pub === "draft" || catalogPubArch?.pub === "published") {
        sp.set("pub", catalogPubArch.pub);
      } else {
        sp.delete("pub");
      }
    },
    [view, titleSort, selectedId, catalogPubArch],
  );

  const navigateWithPatch = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      if (qDebounceRef.current) {
        clearTimeout(qDebounceRef.current);
        qDebounceRef.current = null;
      }
      const base = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const qTrim = qInputRef.current.trim();
      const next = applyParamsPatch(base, {
        ...patch,
        q: qTrim || null,
      });
      mergeWorkspaceInto(next);
      replaceSearch(next);
    },
    [mergeWorkspaceInto, replaceSearch],
  );

  const scheduleCommitQ = useCallback(() => {
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
    qDebounceRef.current = setTimeout(() => {
      qDebounceRef.current = null;
      const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const qTrim = qInputRef.current.trim();
      if (qTrim) sp.set("q", qTrim);
      else sp.delete("q");
      mergeWorkspaceInto(sp);
      replaceSearch(sp);
    }, Q_DEBOUNCE_MS);
  }, [mergeWorkspaceInto, replaceSearch]);

  useEffect(() => {
    setSelectedRegionCode(regionCode ?? null);
  }, [regionCode]);

  useEffect(() => {
    setSelectedExerciseLoad(loadType ?? null);
  }, [loadType]);

  useEffect(() => {
    if (!tertiaryFilter) return;
    setSelectedCustomTertiary(tertiaryFilter.value ?? null);
  }, [tertiaryFilter]);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  useEffect(() => {
    return () => {
      if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
    };
  }, []);

  const regionField = showRegionFilter ? (
    <RegionFilterField
      idPrefix={idPrefix}
      selectedRegionCode={selectedRegionCode}
      onRegionChange={(code) => {
        setSelectedRegionCode(code);
        navigateWithPatch({ region: code });
      }}
    />
  ) : null;

  let typesFilterNode: ReactNode = null;
  if (tertiaryFilter) {
    typesFilterNode = (
      <div className="w-40 shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-${tertiaryFilter.paramName}`}>
          {tertiaryFilter.label}
        </label>
        <ReferenceSelect
          id={`${idPrefix}-${tertiaryFilter.paramName}`}
          prefetchedItems={tertiaryFilter.items}
          valueMatch="code"
          submitField="code"
          value={selectedCustomTertiary}
          onChange={(code) => {
            setSelectedCustomTertiary(code);
            navigateWithPatch({ [tertiaryFilter.paramName]: code });
          }}
          placeholder={tertiaryFilter.placeholder}
          clearOptionLabel={tertiaryFilter.clearLabel}
          missingValueOption={{
            value: DOCTOR_CATALOG_FILTER_MISSING,
            label: tertiaryFilter.missingValueLabel ?? "Без типа",
          }}
          showAllOnFocus
          searchable={false}
        />
      </div>
    );
  } else if (showLoadFilter) {
    typesFilterNode = (
      <div className="w-40 shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-load`}>
          Тип нагрузки
        </label>
        <ReferenceSelect
          id={`${idPrefix}-load`}
          categoryCode={EXERCISE_LOAD_TYPE_CATEGORY_CODE}
          valueMatch="code"
          submitField="code"
          value={selectedExerciseLoad}
          onChange={(code) => {
            setSelectedExerciseLoad(code);
            navigateWithPatch({ load: code });
          }}
          placeholder="Все типы"
          clearOptionLabel="Все типы"
          missingValueOption={missingLoadOption}
          showAllOnFocus
          searchable={false}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2")}>
      <div className="flex flex-wrap items-center gap-2">
        {leadingSlot}
        <div className="w-[168px] min-w-[140px] shrink-0">
          <label className="sr-only" htmlFor={`${idPrefix}-q`}>
            Поиск по названию
          </label>
          <Input
            id={`${idPrefix}-q`}
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              scheduleCommitQ();
            }}
            placeholder="Поиск по названию"
            className="w-full"
          />
        </div>
        {regionField}
        {typesFilterNode}
      </div>
    </div>
  );
}

function RegionFilterField({
  idPrefix,
  selectedRegionCode,
  onRegionChange,
}: {
  idPrefix: string;
  selectedRegionCode: string | null;
  onRegionChange: (code: string | null) => void;
}) {
  return (
    <div className="w-40 shrink-0">
      <label className="sr-only" htmlFor={`${idPrefix}-region`}>
        Регион
      </label>
      <ReferenceSelect
        id={`${idPrefix}-region`}
        categoryCode="body_region"
        valueMatch="code"
        submitField="code"
        value={selectedRegionCode}
        onChange={onRegionChange}
        placeholder="Выберите регион"
        clearOptionLabel="Все регионы"
        missingValueOption={missingRegionOption}
        showAllOnFocus
        searchable={false}
      />
    </div>
  );
}
