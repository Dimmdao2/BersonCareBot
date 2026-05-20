"use client";

import { Button } from "@/components/ui/button";

type Props = {
  shownCount: number;
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  inServerMode?: boolean;
  serverSearchPending?: boolean;
  listError?: string | null;
  localSearchHint?: string | null;
};

export function MediaPickerListFooter({
  shownCount,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  inServerMode,
  serverSearchPending,
  listError,
  localSearchHint,
}: Props) {
  if (shownCount === 0 && !serverSearchPending && !inServerMode && !localSearchHint) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      {inServerMode ? <p className="text-xs text-muted-foreground">По всей библиотеке</p> : null}
      {localSearchHint ? <p className="max-w-md text-center text-xs text-muted-foreground">{localSearchHint}</p> : null}
      {shownCount > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {total != null ? `Показано ${shownCount} из ${total}` : `Показано ${shownCount}`}
          </p>
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => onLoadMore()}
            >
              {loadingMore ? "Загрузка…" : "Загрузить ещё"}
            </Button>
          ) : null}
        </>
      ) : null}
      {serverSearchPending && !listError ? (
        <p className="text-xs text-muted-foreground">Ищем в библиотеке…</p>
      ) : null}
    </div>
  );
}