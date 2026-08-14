import pino from 'pino';
import { randomUUID } from 'node:crypto';
import {
  getCurrentObservabilityContext,
  resolveCorrelationId,
  runWithObservabilityContext,
} from '@bersoncare/db-principal';

/**
 * Унифицированная форма ошибки для структурированных логов — safe-by-construction,
 * закрытая value-free форма: сюда никогда не попадают сырые `message`/`stack`/
 * `JSON.stringify(err)` или произвольные поля из `cause` — только `type` и
 * провалидированный PostgreSQL SQLSTATE `code`/`class`.
 */
export type SerializedError = {
  type: string;
  code?: string;
  class?: string;
};

const PG_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** PostgreSQL SQLSTATE ("code") и его класс (первые 2 символа), если ошибка похожа на pg. */
function safePgErrorCode(err: unknown): Pick<SerializedError, 'code' | 'class'> {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && PG_SQLSTATE_PATTERN.test(code)) {
      return { code, class: code.slice(0, 2) };
    }
  }
  return {};
}

/**
 * Приводит любое значение ошибки к предсказуемой структуре
 * для pino-сериализаторов. `cause` намеренно не сериализуется ни в каком виде:
 * это поле произвольной, неконтролируемой формы (provider errors, HTTP body,
 * custom Error properties и т.п.), и любое копирование его содержимого —
 * даже частичное — нарушает safe-by-construction контракт.
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      type: err.name,
      ...safePgErrorCode(err),
    };
  }

  if (typeof err === 'object' && err !== null) {
    const e = err as { name?: unknown };
    return {
      type: typeof e.name === 'string' ? e.name : 'ErrorLike',
      ...safePgErrorCode(err),
    };
  }

  return { type: 'UnknownError' };
}

/**
 * В development включает pino-pretty,
 * в production/test оставляет JSON-логи.
 */
function buildTransport(): pino.TransportSingleOptions | undefined {
  const isDev = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';
  if (!isDev || isTest) return undefined;

  return {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

const transport = buildTransport();

/** Корневой логгер приложения с редактированием чувствительных полей. */
export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || 'info',
  ...(transport ? { transport } : {}),
  base: { pid: process.pid },
  mixin: getCurrentObservabilityContext,
  redact: {
    paths: [
      'headers.authorization',
      'headers.cookie',
      'headers.x-*-secret-token',
      '*.authorization',
      '*.token',
      '*.secret',
      '*.apikey',
      '*.apiKey',
      '*.password',
      '*.phone',
      '*.phone_number',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: serializeError,
    error: serializeError,
  },
});

/** Генерирует уникальный id события с указанным префиксом. */
export function newEventId(prefix = 'evt'): string {
  return `${prefix}_${randomUUID()}`;
}

/** Infra-owned bridge so integration adapters do not depend on the principal package directly. */
export function newCorrelationId(): string {
  return resolveCorrelationId();
}

export function runWithCorrelationContext<T>(correlationId: string, fn: () => T): T {
  return runWithObservabilityContext({ correlationId }, fn);
}

/** Возвращает child-логгер для HTTP-запроса. */
export function getRequestLogger(requestId: string, context?: Record<string, string>) {
  return logger.child({ requestId, ...(context ?? {}) });
}

/** Возвращает child-логгер для воркер-задач. */
export function getWorkerLogger(jobId?: string, mailingId?: string) {
  const context: Record<string, string> = {};
  if (jobId) context.jobId = jobId;
  if (mailingId) context.mailingId = mailingId;
  return logger.child(context);
}

/** Возвращает child-логгер для миграций БД. */
export function getMigrationLogger(version: string) {
  return logger.child({ migrationVersion: version });
}
