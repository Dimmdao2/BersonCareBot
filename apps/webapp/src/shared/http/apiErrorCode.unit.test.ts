/**
 * Ловимая поломка: `readSafeApiErrorText` начинает читать из тела ответа любой ключ, кроме
 * авторского `message` (`error`, `detail`, «что-нибудь непустое»), — и экран кабинета на «голом»
 * fetch снова рисует врачу и пациенту текст пойманного исключения: запрос, имена колонок и
 * значения параметров. Подали тело с текстом драйвера в `error` — получили этот текст на экране
 * вместо безопасной подписи.
 *
 * Почему это закреплено тестом, а не взглядом. Отказ дорогой: наружу уходит внутренняя схема и
 * значения строк пациента — ровно то, что владелец запретил показывать. И он молчаливый: человек
 * видит обычную красную плашку, тип не меняется (обе ветки возвращают `string`), маршруты и
 * серверный гейт `check-safe-user-error-door.mjs` остаются зелёными — гейт смотрит `catch` в
 * файлах `route.ts` под `src/app/api`, а клиентского читателя не видит вовсе. Это единственное
 * место, через которое
 * 23 экрана (55 вызовов) разбирают отказ, поэтому одна правка здесь открывает утечку сразу везде.
 *
 * Oracle — требование владельца (врач, клиника и пациент не видят SQL, параметры и имена
 * таблиц/колонок) плюс объявленный контракт двери `SafeApiErrorBody`: `error` — машинный код,
 * `message` — только текст, который автор сознательно пометил `UserFacingError`.
 *
 * Второй `it` — обратная сторона того же контракта: защита не должна стоить человеку предметного
 * текста, иначе валидация превращается в безликое «не удалось».
 */
import { describe, expect, it } from 'vitest';
import { readSafeApiErrorText } from './apiErrorCode';

/** Тело, которое отдавал маршрут до перевода на дверь: текст драйвера лежит в `error`. */
const LEAKING_BODY = {
  ok: false,
  error: 'Failed query: select secret_column from patients where phone = $1\nparams: +79990000000',
  detail: 'column "secret_column" does not exist',
};

const FALLBACK = 'Не удалось сохранить';

describe('readSafeApiErrorText — что попадает на экран кабинета с «голого» fetch', () => {
  it('не показывает человеку текст исключения ни из одного ключа, кроме авторского `message`', () => {
    const shown = readSafeApiErrorText(LEAKING_BODY, FALLBACK);

    expect(shown).toBe(FALLBACK);
    expect(shown).not.toContain('secret_column');
    expect(shown).not.toContain('Failed query');
    expect(shown).not.toContain('params:');
    expect(shown).not.toContain('+79990000000');
  });

  it('доводит до человека помеченный автором текст, а не безликий fallback', () => {
    expect(
      readSafeApiErrorText(
        { ok: false, error: 'course_update_failed', message: 'Курс не найден' },
        FALLBACK,
      ),
    ).toBe('Курс не найден');
  });
});
