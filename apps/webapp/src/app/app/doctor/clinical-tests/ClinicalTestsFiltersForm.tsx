"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  q: string;
  view?: "tiles" | "list";
  titleSort?: "asc" | "desc" | null;
  selectedId?: string | null;
};

/** GET-форма фильтров каталога клинических тестов (как фильтры упражнений: одна строка + «Применить»). */
export function ClinicalTestsFiltersForm({ q, view, titleSort, selectedId }: Props) {
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      {titleSort ? <input type="hidden" name="titleSort" value={titleSort} /> : null}
      {selectedId ? <input type="hidden" name="selected" value={selectedId} /> : null}
      <div>
        <label className="sr-only" htmlFor="ct-catalog-q">
          Поиск по названию
        </label>
        <Input
          id="ct-catalog-q"
          name="q"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Название"
          className="w-40"
        />
      </div>
      <Button type="submit" variant="secondary" className="box-border h-[32px] shrink-0 px-3 py-0 text-sm leading-none">
        Применить
      </Button>
    </form>
  );
}
