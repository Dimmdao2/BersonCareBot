"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isStaleServerActionError } from "@/shared/lib/isStaleServerActionError";
import { safeReload } from "@/shared/lib/safeReload";

function hardReload(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("_recover", Date.now().toString());
  window.location.replace(url.toString());
}

/**
 * Локальный fallback для сегментных `error.tsx`: не заменяет корневой layout.
 */
export function SegmentRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const isStaleAction = isStaleServerActionError(error);

  useEffect(() => {
    if (!isStaleAction) return;
    void safeReload("stale-server-action");
  }, [isStaleAction]);

  const message = error.message || "Не удалось загрузить раздел.";

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Код: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => reset()}>
          Попробовать снова
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (isStaleAction) {
              void safeReload("stale-server-action");
              return;
            }
            hardReload();
          }}
        >
          Обновить страницу
        </Button>
      </div>
    </div>
  );
}
