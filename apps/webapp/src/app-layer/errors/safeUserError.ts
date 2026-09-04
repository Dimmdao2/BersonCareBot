import { NextResponse } from 'next/server';
import { logServerRuntimeError } from '@/app-layer/logging/serverRuntimeLog';
import { classifyApiError } from '@/shared/http/apiResponse';
import { userFacingMessage } from '@/shared/errors/userFacingError';

export type SafeApiErrorBody = {
  ok: false;
  /** Машинный код; свободного текста не несёт. */
  error: string;
  /** Текст для человека — только помеченный `UserFacingError`. */
  message?: string;
  /** Непрозрачный correlation id той же ошибки в серверном логе. */
  digest?: string;
};

/**
 * Единственный проход из пойманного исключения в HTTP-ответ кабинета врача/пациента.
 *
 * Неопознанная ошибка наружу отдаёт только `fallbackCode` + `digest`, а в лог уходит закрытая
 * форма `serializeError` (тип/класс/SQLSTATE, без message/SQL/params). Предметная ошибка,
 * помеченная `UserFacingError`, сохраняет свой текст в поле `message`. Поле `error` остаётся
 * машинным кодом при любом входе, поэтому клиент, читающий `error`, не может показать человеку
 * текст исключения.
 */
export function respondWithSafeApiError(
  scope: string,
  error: unknown,
  options: {
    fallbackCode: string;
    /** Статус для неопознанной ошибки. */
    fallbackStatus: number;
    /** Статус предметной ошибки; функция получает её текст либо код. По умолчанию 400. */
    domainStatus?: number | ((userMessageOrCode: string) => number);
  },
): NextResponse<SafeApiErrorBody> {
  const classified = classifyApiError(error, options.fallbackCode);
  const domainStatus = (text: string): number =>
    typeof options.domainStatus === 'function'
      ? options.domainStatus(text)
      : (options.domainStatus ?? 400);

  if (classified.userMessage !== undefined) {
    return NextResponse.json(
      { ok: false as const, error: classified.code, message: classified.userMessage },
      { status: domainStatus(classified.userMessage) },
    );
  }

  if (classified.code !== options.fallbackCode) {
    return NextResponse.json(
      { ok: false as const, error: classified.code },
      { status: domainStatus(classified.code) },
    );
  }

  const { digest } = logServerRuntimeError(scope, error);
  return NextResponse.json(
    { ok: false as const, error: classified.code, digest },
    { status: options.fallbackStatus },
  );
}

/**
 * То же правило для server actions, у которых нет HTTP-статуса: наружу уходит либо помеченный
 * `UserFacingError` текст, либо фиксированная фраза с непрозрачным correlation id. Произвольный
 * `Error.message` (текст драйвера БД, ответ провайдера) в возвращаемое значение не попадает,
 * а сама ошибка не теряется — она уходит в серверный лог в закрытой форме под тем же id.
 */
export function safeActionErrorText(scope: string, error: unknown, fallbackText: string): string {
  const userMessage = userFacingMessage(error);
  if (userMessage !== undefined) return userMessage;
  const { digest } = logServerRuntimeError(scope, error);
  const sentence = /[.!?…]$/.test(fallbackText) ? fallbackText : `${fallbackText}.`;
  return `${sentence} Код для поддержки: ${digest}`;
}
