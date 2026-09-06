import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReminderCreateDialog } from './ReminderCreateDialog';

/**
 * Владелец (бриф этапа): перенос формы в каноническую patient-модалку не должен менять
 * business submission. Отказ дорогой и молчаливый: UI сообщает об успехе, но напоминание
 * оказывается связано не с тем объектом либо получает другое расписание.
 *
 * Геометрия и доступность footer принимаются live, а не через class/DOM-count assertions.
 */
describe('ReminderCreateDialog business submission', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('создаёт напоминание с неизменным linked object и расписанием', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();

    render(
      <ReminderCreateDialog
        open
        onOpenChange={onOpenChange}
        linkedObjectType="content_section"
        linkedObjectId="warmups"
        contextTitle="Разминки"
        existingRule={null}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('/api/patient/reminders/create');
    expect(init.method).toBe('POST');
    /* Сравниваем разобранный payload, а не его строку: порядок ключей — не контракт. */
    expect(JSON.parse(String(init.body))).toEqual({
      linkedObjectType: 'content_section',
      linkedObjectId: 'warmups',
      enabled: true,
      schedule: {
        scheduleType: 'slots_v1',
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: '1111100',
        scheduleData: {
          timesLocal: ['12:00'],
          dayFilter: 'weekdays',
        },
      },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
