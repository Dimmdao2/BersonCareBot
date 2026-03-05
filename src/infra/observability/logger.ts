import pino from 'pino';
import { randomUUID } from 'node:crypto';

/** Унифицированная форма ошибки для структурированных логов. */
export type SerializedError = {
  type: string;
  message: string;
  stack: string | undefined;
  cause?: unknown;
};

/**
 * Приводит любое значение ошибки к предсказуемой структуре
 * для pino-сериализаторов.
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      type: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }

  if (typeof err === 'object' && err !== null) {
    const e = err as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown };
    return {
      type: typeof e.name === 'string' ? e.name : 'ErrorLike',
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      stack: typeof e.stack === 'string' ? e.stack : undefined,
      cause: e.cause,
    };
  }

  return { type: 'UnknownError', message: String(err), stack: undefined };
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
  level: process.env.LOG_LEVEL || 'info',
  ...(transport ? { transport } : {}),
  base: { pid: process.pid, hostname: process.env.HOSTNAME || '' },
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
