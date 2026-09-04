/**
 * Ловимая поломка: маршрут отказал врачу предметным текстом (`message` из `UserFacingError` —
 * «Курс не найден», «Страница вступительного урока должна быть опубликована и не в архиве»), а
 * экран редактирования курса теряет этот текст по дороге к плашке и показывает безликое
 * «Не удалось сохранить». Подали отказ с авторским текстом — получили на экране fallback.
 *
 * Почему тестом, а не взглядом. Отказ молчаливый: тип не меняется (плашка всё так же `string`),
 * маршрут отвечает верно, серверный гейт `check-safe-user-error-door.mjs` смотрит `catch` в
 * `route.ts` и клиентской склейки не видит вовсе, а `readSafeApiErrorText` сам по себе зелёный —
 * ему просто нечего прочитать. И дорогой: врач видит красную плашку без причины отказа и не
 * знает, что чинить, — ровно та цена, ради ухода от которой поле `message` и заведено.
 *
 * Oracle — контракт двери `SafeApiErrorBody` (`error` — машинный код, `message` — авторский текст)
 * и findings F-1/F-2 закрывающего аудита LOG-01.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DoctorCourseEditForm } from './DoctorCourseEditForm';
import { EMPTY_COURSE_USAGE_SNAPSHOT, type CourseRecord } from '@/modules/courses/types';

const TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';

const COURSE: CourseRecord = {
  id: '0194c2c5-1d75-7a42-8b64-a9b49aa52ba3',
  title: 'Курс для спины',
  description: null,
  programTemplateId: TEMPLATE_ID,
  introLessonPageId: null,
  accessSettings: {},
  status: 'draft',
  priceMinor: 0,
  currency: 'RUB',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** Отвечает на PATCH курса телом двери: машинный код в `error`, авторский текст в `message`. */
function stubPatch(body: Record<string, unknown>, status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DoctorCourseEditForm — что видит врач при отказе сохранения', () => {
  it('показывает авторский текст отказа, а не безликий fallback и не машинный код', async () => {
    stubPatch({ ok: false, error: 'course_update_failed', message: 'Курс не найден' }, 400);

    render(
      <DoctorCourseEditForm
        courseId={COURSE.id}
        initial={COURSE}
        templates={[{ id: TEMPLATE_ID, title: 'Шаблон', status: 'published' }]}
        introPageOptions={[]}
        externalUsageSnapshot={EMPTY_COURSE_USAGE_SNAPSHOT}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Курс не найден');
      expect(alert).not.toHaveTextContent('course_update_failed');
    });
  });
});
