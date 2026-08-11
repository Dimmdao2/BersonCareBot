'use client';

import { useEffect } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';

type Props = {
  /** Текст для пользователя. */
  title?: string;
  /** Короткий код из логов сервера (поддержка). */
  digest: string;
  /** Только в development: деталь в UI и в консоли браузера для отладки. */
  devMessage?: string;
  /** Повторить загрузку без раскрытия технической ошибки пользователю. */
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Мягкая деградация при сбое загрузки данных на сервере: сообщение пользователю,
 * код для поддержки; в dev — подсказка и `console.error` в браузере.
 */
export function DataLoadFailureNotice({
  title = 'Не удалось загрузить данные. Попробуйте обновить страницу позже.',
  digest,
  devMessage,
  onRetry,
  retrying = false,
}: Props) {
  const visibleDevMessage = process.env.NODE_ENV === 'development' ? devMessage : undefined;

  useEffect(() => {
    if (visibleDevMessage) {
      console.error('[DataLoadFailure]', { digest, message: visibleDevMessage });
    }
  }, [digest, visibleDevMessage]);

  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-foreground"
    >
      <p className="m-0 font-medium">{title}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Код для поддержки: <span className="font-mono">{digest}</span>
      </p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? 'Повторяем…' : 'Повторить'}
        </Button>
      ) : null}
      {visibleDevMessage ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border/80 bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
          {visibleDevMessage}
        </pre>
      ) : null}
    </div>
  );
}
