'use client';

import { Button } from '@/shared/ui/doctor/primitives/button';

type Props = {
  /** Текст для пользователя. */
  title?: string;
  /** Короткий код из логов сервера (поддержка). */
  digest: string;
  /** Повторить загрузку без раскрытия технической ошибки пользователю. */
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Мягкая деградация при сбое загрузки данных на сервере: сообщение пользователю и код для
 * поддержки.
 *
 * Технической детали здесь нет ни в каком режиме. Раньше компонент принимал `devMessage`
 * (вызывающие передавали `${error.name}: ${error.message}`), рисовал его в DOM и дублировал
 * в `console.error` браузера при `NODE_ENV === 'development'`. Это второй экземпляр текста
 * исключения на клиенте: он попадал в разметку, в консоль и в любые расширения/скриншоты
 * DEV-окружения, где база — реальная копия. Диагностика живёт в серверном логе, найти её
 * по `digest`.
 */
export function DataLoadFailureNotice({
  title = 'Не удалось загрузить данные. Попробуйте обновить страницу позже.',
  digest,
  onRetry,
  retrying = false,
}: Props) {
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
    </div>
  );
}
