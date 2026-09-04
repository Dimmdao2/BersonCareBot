import { randomBytes } from 'node:crypto';
import { logger, serializeError } from './logger';

export type ServerRuntimeLogResult = {
  /** Короткий id для ссылки пользователем в поддержку; дублируется в JSON-логе. */
  digest: string;
};

/**
 * Структурированная запись через pino (journald/systemd на хосте подхватывает stderr).
 * Не логируйте секреты и полные connection string.
 *
 * Возвращается ТОЛЬКО `digest`. Раньше функция возвращала ещё `name` и сырой `message`, и
 * вызывающие страницы прокидывали `${name}: ${message}` в клиентский компонент — то есть текст
 * исключения (SQL драйвера вместе с параметрами) уезжал в RSC-payload и в DOM. Сузить тип —
 * единственный способ, при котором такой вызов перестаёт компилироваться, а не перестаёт
 * нравиться ревьюеру.
 */
export function logServerRuntimeError(
  scope: string,
  err: unknown,
  extra?: Record<string, string | number | boolean | undefined>,
): ServerRuntimeLogResult {
  const digest = randomBytes(4).toString('hex');

  logger.error(
    {
      scope,
      digest,
      // `serializeError` — закрытая value-free форма `{type, code?, class?}` (LOG-01/L1):
      // ни `message`, ни `stack`, ни `cause` в payload не попадают.
      err: serializeError(err),
      ...extra,
    },
    'server_runtime_error',
  );

  return { digest };
}
