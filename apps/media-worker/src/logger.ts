import pino from 'pino';
import { getCurrentObservabilityContext } from './observability.js';
import type { MediaWorkerEnv } from './env.js';

/**
 * Unified error shape for pino serializers (aligned with integrator/webapp) —
 * safe-by-construction, a closed value-free shape: raw `message`/`stack`/
 * `JSON.stringify(err)` and arbitrary `cause` fields never pass through, only
 * `type` and the validated PostgreSQL SQLSTATE `code`/`class`.
 */
export type SerializedError = {
  type: string;
  code?: string;
  class?: string;
};

const PG_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** PostgreSQL SQLSTATE ("code") and its class (first 2 chars), if the shape matches. */
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
 * `cause` is intentionally never serialized in any form: it is an
 * unconstrained, arbitrary-shape field (provider errors, HTTP bodies, custom
 * Error properties, etc), and copying any part of it — even partially —
 * breaks the safe-by-construction contract.
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
 * Операторская форма той же ошибки — С текстом. Нужна, потому что закрытая форма выше по
 * построению не может назвать причину: 14.09.2026 отчёт воркера об инструментах падал на каждом
 * старте, в логе стояло `preview tools report failed` и `{"type":"Error"}`, и причину пришлось
 * воспроизводить запуском кода. Такой отказ виден только оператору и ничего пользователю не
 * показывает — значит текст в нём уместен, а закрытую форму `err` он не трогает.
 */
export type SerializedOperatorErrorDetail = SerializedError & {
  message?: string;
  stack?: string;
  cause?: SerializedOperatorErrorDetail;
};

/** Ограничение глубины: самоссылающийся `cause` иначе делает строку лога бесконечной. */
const OPERATOR_ERROR_CAUSE_DEPTH = 3;

export function serializeOperatorErrorDetail(
  err: unknown,
  depth = OPERATOR_ERROR_CAUSE_DEPTH,
): SerializedOperatorErrorDetail {
  const base = serializeError(err);
  if (err instanceof Error) {
    const cause = depth > 0 && err.cause !== undefined && err.cause !== null ? err.cause : undefined;
    return {
      ...base,
      message: err.message,
      ...(typeof err.stack === 'string' ? { stack: err.stack } : {}),
      ...(cause === undefined ? {} : { cause: serializeOperatorErrorDetail(cause, depth - 1) }),
    };
  }
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    return { ...base, ...(typeof message === 'string' ? { message } : {}) };
  }
  return { ...base, ...(err === undefined ? {} : { message: String(err) }) };
}

export function createLogger(env: Pick<MediaWorkerEnv, 'LOG_LEVEL'>) {
  return pino({
    level: env.LOG_LEVEL || 'info',
    mixin: getCurrentObservabilityContext,
    /*
     * У воркера НЕТ пользовательской поверхности: он не отвечает ни пациенту, ни специалисту, и
     * каждая его строка лога — операторская. Поэтому здесь `err` несёт текст. В вебаппе и
     * интеграторе закрытая форма остаётся: там одна и та же ошибка может уехать в ответ.
     *
     * Почему это правка, а не украшение: 14.09.2026 отчёт воркера об инструментах падал на каждом
     * старте, из-за чего превью, ждавшие декодера, не выпускались никогда. В логе стояло
     * `preview tools report failed` и `{"type":"Error"}` — причины не было вообще, и её пришлось
     * воспроизводить запуском кода против живой базы.
     */
    serializers: {
      err: serializeOperatorErrorDetail,
      error: serializeOperatorErrorDetail,
      operatorErrorDetail: serializeOperatorErrorDetail,
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
