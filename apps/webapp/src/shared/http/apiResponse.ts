import { NextResponse } from 'next/server';

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

export function jsonError<
  const Code extends string,
  const Payload extends object = Record<never, never>,
>(
  error: Code,
  publicFields: JsonResponsePayload<Payload>,
  init?: ResponseInit,
): NextResponse<{ ok: false; error: Code } & Payload> {
  return NextResponse.json({ ok: false, error, ...publicFields }, init);
}
