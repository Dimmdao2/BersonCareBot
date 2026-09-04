/**
 * Ловимая поломка: server action кабинета врача вернул наружу `e.message` пойманного исключения,
 * и текст драйвера БД (запрос + значения параметров) попал в поле, которое экран рисует человеку.
 * Отказ дорогой и молчаливый — для пользователя это обычная строка «ошибка сохранения».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ logServerRuntimeError: vi.fn() }));
vi.mock('@/app-layer/logging/serverRuntimeLog', () => ({
  logServerRuntimeError: fakes.logServerRuntimeError,
}));

import { safeActionErrorText } from './safeUserError';
import { UserFacingError } from '@/shared/errors/userFacingError';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('safeActionErrorText', () => {
  it('не отдаёт наружу текст исключения, но сохраняет correlation id в логе', () => {
    fakes.logServerRuntimeError.mockReturnValue({ digest: 'deadbeef' });
    const failure = new Error(
      `Failed query: insert into patients … params: ${SENSITIVE_TEST_MARKER}`,
    );

    const text = safeActionErrorText('app/doctor/test-sets', failure, 'Ошибка сохранения');

    expect(text).not.toContain(SENSITIVE_TEST_MARKER);
    expect(text).toBe('Ошибка сохранения. Код для поддержки: deadbeef');
    expect(fakes.logServerRuntimeError).toHaveBeenCalledWith('app/doctor/test-sets', failure);
  });

  it('сохраняет предметный текст, помеченный автором кода', () => {
    const text = safeActionErrorText(
      'app/doctor/test-sets',
      new UserFacingError('Название набора обязательно'),
      'Ошибка сохранения',
    );

    expect(text).toBe('Название набора обязательно');
    expect(fakes.logServerRuntimeError).not.toHaveBeenCalled();
  });
});
