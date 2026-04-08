"use client";

import { useEffect } from "react";

type Props = {
  /** Текст для пользователя. */
  title?: string;
  /** Короткий код из логов сервера (поддержка). */
  digest: string;
  /** Только в development: деталь в UI и в консоли браузера для отладки. */
  devMessage?: string;
};

/**
 * Мягкая деградация при сбое загрузки данных на сервере: сообщение пользователю,
 * код для поддержки; в dev — подсказка и `console.error` в браузере.
 */
export function DataLoadFailureNotice({
  title = "Не удалось загрузить данные. Попробуйте обновить страницу позже.",
  digest,
  devMessage,
}: Props) {
  useEffect(() => {
    if (devMessage) {
      console.error("[DataLoadFailure]", { digest, message: devMessage });
    }
  }, [digest, devMessage]);

  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-foreground"
    >
      <p className="m-0 font-medium">{title}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Код для поддержки: <span className="font-mono">{digest}</span>
      </p>
      {devMessage ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border/80 bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
          {devMessage}
        </pre>
      ) : null}
    </div>
  );
}
