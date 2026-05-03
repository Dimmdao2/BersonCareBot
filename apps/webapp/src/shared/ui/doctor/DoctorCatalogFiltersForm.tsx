"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import { EXERCISE_LOAD_TYPE_OPTIONS } from "@/modules/lfk-exercises/exerciseLoadTypeOptions";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import type { ReactNode } from "react";

const EXERCISE_LOAD_FILTER_ITEMS: ReferenceItemDto[] = EXERCISE_LOAD_TYPE_OPTIONS.map((option, idx) => ({
  id: `ex-filter-load-${option.value}`,
  code: option.value,
  title: option.label,
  sortOrder: idx + 1,
}));

const Q_DEBOUNCE_MS = 350;

/** Альтернатива колонке «тип нагрузки»: свой справочник и имя GET-параметра (например область рекомендаций — `domain`). */
export type DoctorCatalogTertiaryFilter = {
  items: ReferenceItemDto[];
  paramName: string;
  value: string | null;
  label: string;
  placeholder: string;
  clearLabel: string;
  /** Зарезервировано для подписей вне формы (строка под фильтрами удалена). */
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedRegionRefId, setSelectedRegionRefId] = useState<string | null>(regionRefId ?? null);
  const [selectedExerciseLoad, setSelectedExerciseLoad] = useState<string | null>(loadType ?? null);
  const [selectedCustomTertiary, setSelectedCustomTertiary] = useState<string | null>(
    tertiaryFilter?.value ?? null,
  );
  const [qInput, setQInput] = useState(q);

  const qInputRef = useRef(qInput);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    qInputRef.current = qInput;
  }, [qInput]);

  const replaceSearch = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
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
      const base = new URLSearchParams(searchParams.toString());
      const qTrim = qInputRef.current.trim();
      const next = applyParamsPatch(base, {
        ...patch,
        q: qTrim || null,
      });
      mergeWorkspaceInto(next);
      replaceSearch(next);
    },
    [mergeWorkspaceInto, replaceSearch, searchParams],
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
    setSelectedRegionRefId(regionRefId ?? null);
  }, [regionRefId]);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {leadingSlot}
      <div className="w-[220px] shrink-0">
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
      <div className="w-40 shrink-0">
        <label className="sr-only" htmlFor={`${idPrefix}-region`}>
          Регион
        </label>
        <ReferenceSelect
          id={`${idPrefix}-region`}
          categoryCode="body_region"
          value={selectedRegionRefId}
          onChange={(refId) => {
            setSelectedRegionRefId(refId);
            navigateWithPatch({ region: refId });
          }}
          placeholder="Выберите регион"
          clearOptionLabel="Все регионы"
          showAllOnFocus
          searchable={false}
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
              showAllOnFocus
              searchable={false}
            />
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`${idPrefix}-load`}>
              Тип нагрузки
            </label>
            <ReferenceSelect
              id={`${idPrefix}-load`}
              prefetchedItems={EXERCISE_LOAD_FILTER_ITEMS}
              valueMatch="code"
              submitField="code"
              value={selectedExerciseLoad}
              onChange={(code) => {
                setSelectedExerciseLoad(code);
                navigateWithPatch({ load: code });
              }}
              placeholder="Все типы"
              clearOptionLabel="Все типы"
              showAllOnFocus
              searchable={false}
            />
          </>
        )}
      </div>
    </div>
  );
}
