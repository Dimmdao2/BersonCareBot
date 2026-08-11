import pino from 'pino';
import type { MediaWorkerEnv } from './env.js';
import { getCurrentObservabilityContext } from './observability.js';

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

export function createLogger(env: Pick<MediaWorkerEnv, 'LOG_LEVEL'>) {
  return pino({
    level: env.LOG_LEVEL || 'info',
    mixin: getCurrentObservabilityContext,
    serializers: {
      err: serializeError,
      error: serializeError,
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
