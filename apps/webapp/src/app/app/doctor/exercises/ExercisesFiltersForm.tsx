"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";

type Props = {
  q: string;
  regionRefId?: string;
  loadType?: ExerciseLoadType;
  view?: "tiles" | "list";
};

export function ExercisesFiltersForm({ q, regionRefId, loadType, view }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedRegionRefId, setSelectedRegionRefId] = useState<string | null>(regionRefId ?? null);
  const [selectedRegionLabel, setSelectedRegionLabel] = useState("");

  return (
    <form ref={formRef} method="get" className="flex flex-wrap items-end gap-2">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="ex-q">
          Поиск по названию
        </label>
        <Input id="ex-q" name="q" defaultValue={q} placeholder="Название" className="w-56" />
      </div>
      <div className="flex flex-col gap-1 min-w-[16rem]">
        <label className="text-xs text-muted-foreground" htmlFor="ex-region">
          Область тела
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
          placeholder="Выберите область"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="ex-load">
          Тип нагрузки
        </label>
        <select
          id="ex-load"
          name="load"
          className="h-9 w-auto min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={loadType ?? ""}
        >
          <option value="">Все</option>
          <option value="strength">Силовая</option>
          <option value="stretch">Растяжка</option>
          <option value="balance">Баланс</option>
          <option value="cardio">Кардио</option>
          <option value="other">Другое</option>
        </select>
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
          Сбросить область
        </Button>
      ) : null}
      {selectedRegionLabel ? (
        <p className="w-full text-xs text-muted-foreground">Выбрано: {selectedRegionLabel}</p>
      ) : null}
    </form>
  );
}
