"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";

type Props = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  view?: "tiles" | "list";
  titleSort?: "asc" | "desc" | null;
};

/** Совпадает с `ExerciseLoadType` и парсингом query в `page.tsx`. */
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

export function ExercisesFiltersForm({ q, regionRefId, loadType, view, titleSort }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedRegionRefId, setSelectedRegionRefId] = useState<string | null>(regionRefId ?? null);
  const [selectedRegionLabel, setSelectedRegionLabel] = useState("");
  const [selectedLoadCode, setSelectedLoadCode] = useState<string | null>(loadType ?? null);
  const [selectedLoadLabel, setSelectedLoadLabel] = useState(() => loadTypeTitle(loadType));

  return (
    <form ref={formRef} method="get" className="flex flex-wrap items-end gap-2">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      {titleSort ? <input type="hidden" name="titleSort" value={titleSort} /> : null}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="ex-q">
          Поиск по названию
        </label>
        <Input id="ex-q" name="q" defaultValue={q} placeholder="Название" className="w-56" />
      </div>
      <div className="flex flex-col gap-1 min-w-[16rem]">
        <label className="text-xs text-muted-foreground" htmlFor="ex-region">
          Регион
        </label>
        <ReferenceSelect
          id="ex-region"
          name="region"
          categoryCode="body_region"
          value={selectedRegionRefId}
          onChange={(refId, label) => {
            setSelectedRegionRefId(refId);
            setSelectedRegionLabel(label);
          }}
          placeholder="Выберите регион"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[16rem]">
        <label className="text-xs text-muted-foreground" htmlFor="ex-load">
          Тип нагрузки
        </label>
        <ReferenceSelect
          id="ex-load"
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
      <Button type="submit" variant="secondary">
        Применить
      </Button>
      {selectedRegionRefId ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            flushSync(() => {
              setSelectedRegionRefId(null);
              setSelectedRegionLabel("");
            });
            formRef.current?.requestSubmit();
          }}
        >
          Сбросить регион
        </Button>
      ) : null}
      {selectedLoadCode ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            flushSync(() => {
              setSelectedLoadCode(null);
              setSelectedLoadLabel("");
            });
            formRef.current?.requestSubmit();
          }}
        >
          Сбросить тип нагрузки
        </Button>
      ) : null}
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
