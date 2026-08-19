/**
 * §34 канона владельца: пояс сотрудника ОПРЕДЕЛЯЕТСЯ устройством (ручной настройки нет), но уже
 * сохранённое значение при этом не переезжает молча — «человек, поставивший 9:00 в Новосибирске, в
 * Москве будет разбужен в шесть».
 *
 * Отказ, который ловят эти тесты:
 *  1. определение отвалилось вместе со снятым селектором — у сотрудника пояс пустой навсегда,
 *     расписание и напоминания считаются по поясу приложения;
 *  2. обратный перекос — bootstrap пишет пояс устройства на КАЖДОЙ загрузке экрана, и одна поездка
 *     молча сдвигает всё, что сотрудник задал по стенным часам.
 * Оба дорогие (пропущенные приёмы и уведомления не в своё время) и молчаливые.
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

describe('StaffCalendarTimezoneBootstrap', () => {
  it('записывает пояс устройства, когда у сотрудника его ещё нет', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ ok: true })
        : Response.json({ ok: true, timezone: null }),
    );

    render(<StaffCalendarTimezoneBootstrap />);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0]![1]!.body as string)).toEqual({
      browserCalendarIana: 'Europe/Moscow',
    });
  });

  it('не перезаписывает уже сохранённый пояс', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ ok: true })
        : Response.json({ ok: true, timezone: 'Asia/Novosibirsk' }),
    );

    render(<StaffCalendarTimezoneBootstrap />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(postCalls()).toHaveLength(0);
  });
});
