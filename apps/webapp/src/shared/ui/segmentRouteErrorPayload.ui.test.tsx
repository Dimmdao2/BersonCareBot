/**
 * Ловимая поломка: сегментная граница ошибки (`error.tsx` кабинета врача и пациента) отрисовала
 * `error.message` в HTML и продублировала сырой `Error` в `console.error` браузера. В проде туда
 * попадает текст исключения — запрос драйвера БД вместе со значениями параметров и клиническими
 * полями, — и человек читает его на экране, а расширения/скриншоты забирают из консоли.
 *
 * Отказ дорогой (чужие данные и внутренняя схема) и молчаливый (экран выглядит как обычная
 * страница «что-то пошло не так»), поэтому он закреплён тестом.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/doctor/clients',
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import { SegmentRouteError as DoctorSegmentRouteError } from './doctor/SegmentRouteError';
import { SegmentRouteError as PatientSegmentRouteError } from './patient/SegmentRouteError';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

function databaseFailure(): Error & { digest?: string } {
  return Object.assign(
    new Error(
      `Failed query: select secret_column from patients where phone = $1\nparams: ${SENSITIVE_TEST_MARKER}`,
    ),
    { digest: 'a1b2c3d4' },
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => null }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe.each([
  ['кабинет врача', DoctorSegmentRouteError],
  ['кабинет пациента', PatientSegmentRouteError],
])('SegmentRouteError — %s', (_zone, Boundary) => {
  it('не показывает текст исключения и не пишет сырой Error в консоль браузера', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Boundary error={databaseFailure()} reset={vi.fn()} />);

    expect(document.body.textContent ?? '').not.toContain(SENSITIVE_TEST_MARKER);
    expect(document.body.textContent ?? '').not.toContain('secret_column');
    expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить раздел.');
    // Непрозрачный код остаётся: по нему поддержка находит закрытую запись в серверном логе.
    expect(screen.getByRole('alert').textContent).toContain('a1b2c3d4');

    const consoleOutput = JSON.stringify(consoleError.mock.calls.map((call) => call.map(String)));
    expect(consoleOutput).not.toContain(SENSITIVE_TEST_MARKER);
    expect(consoleOutput).not.toContain('secret_column');
  });
});
