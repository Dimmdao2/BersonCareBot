/**
 * Ловимая поломка: маршрут положил в поле `error` текст пойманного исключения (SQL драйвера
 * вместе с параметрами), `apiJson` сделал из него `Error`, а вызывающий экран показал этот
 * текст человеку в toast/`setError`. Отказ дорогой (внутренняя схема и значения строк наружу)
 * и молчаливый (выглядит как обычное «не сохранилось»).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiJson } from './apiJson';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

function respondWith(body: unknown, status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiJson', () => {
  it('не превращает произвольный серверный текст в показываемую ошибку', async () => {
    respondWith(
      {
        ok: false,
        error: `Failed query: select secret_column from patients\nparams: ${SENSITIVE_TEST_MARKER}`,
      },
      500,
    );

    const failure = await apiJson('/api/doctor/comments').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiRequestError);
    const error = failure as ApiRequestError;
    expect(error.message).not.toContain(SENSITIVE_TEST_MARKER);
    expect(error.message).not.toContain('secret_column');
    expect(error.message).toBe('http_500');
    expect(error.code).toBe('http_500');
    expect(error.status).toBe(500);
  });

  it('сохраняет машинный код маршрута и correlation id', async () => {
    respondWith({ ok: false, error: 'slot_overlap', digest: 'a1b2c3d4' }, 409);

    const error = (await apiJson('/api/doctor/booking-engine/calendar').catch(
      (e: unknown) => e,
    )) as ApiRequestError;

    expect({ code: error.code, digest: error.digest, status: error.status }).toEqual({
      code: 'slot_overlap',
      digest: 'a1b2c3d4',
      status: 409,
    });
  });

  it('показывает продуктовую копию, которую маршрут написал сам', async () => {
    respondWith({ ok: false, error: 'invalid_email', message: 'Укажите корректный email' }, 400);

    const error = (await apiJson('/api/public/support').catch(
      (e: unknown) => e,
    )) as ApiRequestError;

    expect(error.message).toBe('Укажите корректный email');
    expect(error.code).toBe('invalid_email');
  });
});
