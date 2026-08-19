/**
 * §34 канона владельца: пояс сотрудника ОПРЕДЕЛЯЕТСЯ устройством, ручной настройки нет. Владелец,
 * 20.08: «не спрашивать — согласен», то есть при переезде сохранённый пояс догоняет устройство молча,
 * без вопроса. Стенные часы расписания при этом живут у ФИЛИАЛА, а не у человека, — поэтому переезд
 * человека их не двигает.
 *
 * Отказ, который ловят эти тесты:
 *  1. определение отвалилось вместе со снятым селектором — у сотрудника пояс пустой навсегда,
 *     напоминания считаются по поясу приложения;
 *  2. переезд не доезжает — воркер уведомлений продолжает считать по старому поясу, человек получает
 *     напоминание среди ночи;
 *  3. обратный перекос — запись уходит на КАЖДОЙ загрузке экрана, даже когда ничего не менялось.
 * Все три молчаливые.
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffCalendarTimezoneBootstrap } from './StaffCalendarTimezoneBootstrap';

vi.mock('@/shared/lib/browserCalendarIana', () => ({
  getBrowserCalendarIanaForAuth: () => 'Europe/Moscow',
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function postCalls() {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === 'POST',
  );
}

function respondWithStored(timezone: string | null) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({ ok: true })
      : Response.json({ ok: true, timezone }),
  );
}

describe('StaffCalendarTimezoneBootstrap', () => {
  it('записывает пояс устройства, когда у сотрудника его ещё нет', async () => {
    respondWithStored(null);

    render(<StaffCalendarTimezoneBootstrap />);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0]![1]!.body as string)).toEqual({
      browserCalendarIana: 'Europe/Moscow',
    });
  });

  it('догоняет устройство, когда человек переехал', async () => {
    respondWithStored('Asia/Novosibirsk');

    render(<StaffCalendarTimezoneBootstrap />);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0]![1]!.body as string)).toEqual({
      browserCalendarIana: 'Europe/Moscow',
    });
  });

  it('молчит, когда сохранённый пояс уже совпадает с устройством', async () => {
    respondWithStored('Europe/Moscow');

    render(<StaffCalendarTimezoneBootstrap />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(postCalls()).toHaveLength(0);
  });
});
