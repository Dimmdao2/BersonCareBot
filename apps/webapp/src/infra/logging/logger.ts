import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { getCurrentObservabilityContext } from '@bersoncare/db-principal';
import { env } from '@/config/env';

/**
 * Unified error shape for pino serializers (aligned with integrator) — safe-by-
 * construction, a closed value-free shape: raw `message`/`stack`/
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
 * Operator-only counterpart of `SerializedError`. S4 (owner plan
 * `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, wave 03.09) requires that the
 * detail the user stops seeing does not simply disappear: the operator must gain what is lost
 * today. `serializeError` deliberately cannot carry it — its closed shape is what makes every
 * `err`/`error` log line safe by construction — so widening it would weaken every other call site.
 * This is therefore a separate, deliberately typed key, not an accidental raw field: it is reachable
 * only through the `operatorErrorDetail` serializer below, and only the shared response door writes
 * it, always next to the same correlation id the caller received.
 */
export type SerializedOperatorErrorDetail = {
  type: string;
  code?: string;
  class?: string;
  message?: string;
  stack?: string;
  cause?: SerializedOperatorErrorDetail;
};

/** Bounded so a self-referential or deeply chained `cause` cannot make a log line unbounded. */
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

/**
 * The single serializer table the root logger installs. Exported so the S4 behavioural test asserts
 * the real wiring (which key keeps detail, which key drops it) instead of a copy of it.
 */
export const LOG_SERIALIZERS = {
  err: serializeError,
  error: serializeError,
  operatorErrorDetail: serializeOperatorErrorDetail,
} as const;

function buildTransport(): pino.TransportSingleOptions | undefined {
  const isDev = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';
  if (!isDev || isTest) return undefined;

  return {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

const transport = buildTransport();

/** Root logger: JSON in prod/test, pretty in development. */
export const logger = pino({
  level: env.LOG_LEVEL ?? 'info',
  ...(transport ? { transport } : {}),
  base: { service: 'bersoncare-webapp', pid: process.pid },
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
  serializers: LOG_SERIALIZERS,
});

export function newEventId(prefix = 'evt'): string {
  return `${prefix}_${randomUUID()}`;
}

export function getRequestLogger(requestId: string, context?: Record<string, string>) {
  return logger.child({ requestId, ...(context ?? {}) });
}
