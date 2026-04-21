"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecommendationArchiveScope } from "@/modules/recommendations/types";

type Props = {
  q: string;
  view?: "tiles" | "list";
  titleSort?: "asc" | "desc" | null;
  selectedId?: string | null;
  archiveScope?: RecommendationArchiveScope;
};

/** GET-форма фильтров каталога рекомендаций (как клинические тесты: строка поиска + «Применить»). */
export function RecommendationsFiltersForm({ q, view, titleSort, selectedId, archiveScope }: Props) {
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      {titleSort ? <input type="hidden" name="titleSort" value={titleSort} /> : null}
      {selectedId ? <input type="hidden" name="selected" value={selectedId} /> : null}
      {archiveScope != null && archiveScope !== "active" ? (
        <input type="hidden" name="scope" value={archiveScope} />
      ) : null}
      <div>
        <label className="sr-only" htmlFor="rec-catalog-q">
          Поиск по названию
        </label>
        <Input
          id="rec-catalog-q"
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
