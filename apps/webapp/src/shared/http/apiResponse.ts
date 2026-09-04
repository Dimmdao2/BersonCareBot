import { NextResponse } from 'next/server';
import { ensureCorrelationId } from '@bersoncare/db-principal';
import { logger } from '@/infra/logging/logger';

export type JsonPrimitive = boolean | number | string | null;

type NonJsonValue = bigint | symbol | ((...args: never[]) => unknown);

/**
 * Compile-time guard for values accepted by JSON.stringify in response payloads.
 * `undefined` is allowed only so optional object fields can retain normal JSON omission semantics.
 */
export type JsonSerializableInput<Value> = Value extends NonJsonValue
  ? never
  : Value extends JsonPrimitive | undefined
    ? Value
    : Value extends { toJSON(): infer Serialized }
      ? JsonSerializableInput<Serialized> extends never
        ? never
        : Value
      : Value extends readonly unknown[]
        ? { readonly [Key in keyof Value]: JsonSerializableInput<Value[Key]> }
        : Value extends object
          ? { readonly [Key in keyof Value]: JsonSerializableInput<Value[Key]> }
          : never;

type ReservedResponseKeys = {
  readonly error?: never;
  readonly ok?: never;
};

type JsonResponsePayload<Payload extends object> = Payload &
  JsonSerializableInput<Payload> &
  ReservedResponseKeys;

export type ApiErrorPublicFields = Readonly<Record<string, JsonPrimitive | undefined>>;

export type ApiErrorDescriptor = Readonly<{
  code: string;
  headers?: HeadersInit;
  publicFields?: ApiErrorPublicFields;
  status: number;
}>;

export type ApiErrorLiteralRules = Readonly<Record<string, ApiErrorDescriptor>>;

export type ApiTypedErrorRule = Readonly<{
  literalRules: ApiErrorLiteralRules;
  matches: (error: unknown) => error is Error;
}>;

/** A trusted typed error whose public HTTP representation is explicit at construction time. */
export class TypedApiResponseError extends Error {
  readonly descriptor: ApiErrorDescriptor;

  constructor(descriptor: ApiErrorDescriptor) {
    super(descriptor.code);
    this.name = 'TypedApiResponseError';
    this.descriptor = descriptor;
  }
}

function ownLiteralRule(
  literalRules: ApiErrorLiteralRules,
  message: string,
): ApiErrorDescriptor | undefined {
  if (!Object.prototype.hasOwnProperty.call(literalRules, message)) return undefined;
  return literalRules[message];
}

/**
 * Maps only trusted typed errors or exact caller-owned literal rules. Unknown values always use the fixed fallback.
 * This deliberately has no global registry, substring matching, provider/SQL inspection, logging, or side effects.
 */
export function mapApiError(
  error: unknown,
  literalRules: ApiErrorLiteralRules,
  fallback: ApiErrorDescriptor,
  typedRules: readonly ApiTypedErrorRule[] = [],
): ApiErrorDescriptor {
  if (error instanceof TypedApiResponseError) return error.descriptor;
  for (const typedRule of typedRules) {
    if (!typedRule.matches(error)) continue;
    return ownLiteralRule(typedRule.literalRules, error.message) ?? fallback;
  }
  if (error instanceof Error) return ownLiteralRule(literalRules, error.message) ?? fallback;
  return fallback;
}

export function jsonOk<const Payload extends object>(
  payload: JsonResponsePayload<Payload>,
  init?: ResponseInit,
): NextResponse<{ ok: true } & Payload> {
  return NextResponse.json({ ok: true, ...payload }, init);
}

/**
 * A caught failure plus the caller-owned rules that decide its public representation. This is the
 * second accepted parameter shape of `jsonError` below — S4 (owner plan
 * `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, wave 03.09) deliberately does
 * not add a second error-response function next to `jsonError`: an alternative door is a door that
 * can be forgotten, and the existing one already carries everything except the failure itself.
 */
export type ApiFailure = Readonly<{
  error: unknown;
  literalRules?: ApiErrorLiteralRules;
  fallback: ApiErrorDescriptor;
  typedRules?: readonly ApiTypedErrorRule[];
  /** Operator log event name; only used when the failure is unmapped. */
  logEvent?: string;
}>;

export type ResolvedApiFailure = Readonly<{
  descriptor: ApiErrorDescriptor;
  /**
   * Set only when the failure was unmapped. The same value is written to the operator log and
   * returned to the caller, so an operator can find the full detail from what the user quotes.
   */
  correlationId?: string;
}>;

export type ApiErrorResponseBody = {
  ok: false;
  error: string;
  correlationId?: string;
};

function isApiFailure(candidate: unknown): candidate is ApiFailure {
  return typeof candidate === 'object' && candidate !== null && 'fallback' in candidate;
}

/**
 * The single point that decides what a caught failure means for both audiences at once.
 *
 * A known code (caller allowlist or trusted typed error) stays exactly as distinct as `mapApiError`
 * made it — no id, no log line, no change to an already-safe response shape. An unmapped failure
 * takes the caller's fixed fallback instead of its own text and, in the same step, obtains this
 * request's correlation id and writes the full internal detail to the operator log under that id
 * (`operatorErrorDetail`, the deliberately detail-preserving serializer in `@/infra/logging/logger`
 * — never the closed `err`/`error` keys). React's `error.digest` is not reused here: it exists only
 * for boundaries React itself renders, and no API response has one.
 *
 * `jsonError` calls this for its HTTP transport; server actions, which return a plain object rather
 * than a `NextResponse`, call it directly. There is one implementation of the decision, not two.
 */
export function resolveApiFailure(failure: ApiFailure): ResolvedApiFailure {
  const descriptor = mapApiError(
    failure.error,
    failure.literalRules ?? {},
    failure.fallback,
    failure.typedRules ?? [],
  );
  // `mapApiError` returns the caller's fallback object itself when nothing matched.
  if (descriptor !== failure.fallback) return { descriptor };
  const correlationId = ensureCorrelationId();
  logger.error(
    { correlationId, operatorErrorDetail: failure.error },
    failure.logEvent ?? 'api_unmapped_error',
  );
  return { descriptor, correlationId };
}

/**
 * The failed half of a server action's own result, carrying the same two fields — and the same
 * field names — as `ApiErrorResponseBody` above. A server action returns a plain object instead of
 * a `NextResponse`, so this is what "the response body" means on that transport: spread it into the
 * action's `{ ok: false }` result and both audiences get exactly what the HTTP door gives them.
 */
export type ActionFailureFields = Readonly<{
  error: string;
  /** Present only for an unmapped failure — the id its operator log line was written under. */
  correlationId?: string;
}>;

/**
 * The non-HTTP transport of the same decision. A server action's result is rendered by the client
 * component that called it, so returning a caught error's own text puts SQL, table names and bound
 * parameters on the doctor's screen exactly like an API body did. The caller's fixed code goes to
 * the screen; the full detail goes to the operator log under the correlation id. `status` belongs
 * to the shared descriptor — a server action has no HTTP status of its own, so it declares the
 * equivalent one and nothing reads it back.
 *
 * Returns the id as well as the code, because the owner decision behind S4 is one requirement, not
 * two: the internal text stays with the operator *and* the person is given the short reference that
 * text was filed under. Dropping the id here left an unknown DB failure on a doctor's screen as a
 * bare `toggle_failed` with nothing to quote to support — the log line existed and was unreachable.
 * A known domain code is unchanged and carries no id: there is nothing filed to look up.
 */
export function safeActionFailure(
  error: unknown,
  code: string,
  logEvent: string,
): ActionFailureFields {
  const { descriptor, correlationId } = resolveApiFailure({
    error,
    fallback: { code, status: 500 },
    logEvent,
  });
  if (correlationId === undefined) return { error: descriptor.code };
  return { error: descriptor.code, correlationId };
}

export function jsonError<
  const Code extends string,
  const Payload extends object = Record<never, never>,
>(
  error: Code,
  publicFields: JsonResponsePayload<Payload>,
  init?: ResponseInit,
): NextResponse<{ ok: false; error: Code } & Payload>;
export function jsonError(
  failure: ApiFailure,
  init?: ResponseInit,
): NextResponse<ApiErrorResponseBody>;
export function jsonError(
  errorOrFailure: string | ApiFailure,
  publicFieldsOrInit?: object,
  init?: ResponseInit,
): NextResponse {
  if (!isApiFailure(errorOrFailure)) {
    return NextResponse.json(
      { ok: false, error: errorOrFailure, ...(publicFieldsOrInit ?? {}) },
      init,
    );
  }
  const { descriptor, correlationId } = resolveApiFailure(errorOrFailure);
  return NextResponse.json(
    {
      ok: false,
      error: descriptor.code,
      ...(descriptor.publicFields ?? {}),
      ...(correlationId === undefined ? {} : { correlationId }),
    },
    {
      status: descriptor.status,
      ...(descriptor.headers === undefined ? {} : { headers: descriptor.headers }),
      ...((publicFieldsOrInit as ResponseInit | undefined) ?? {}),
    },
  );
}
