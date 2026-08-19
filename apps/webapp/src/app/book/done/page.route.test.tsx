import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * A public booker has no account and no session. Before this test existed the page ignored the
 * booking it was handed and always rendered the same generic "мы получили заявку" sentence — no
 * service, no time, no place, no way to add it to a calendar (owner report, 19.08). These tests
 * drive the page the way a real redirect from the booking wizard does: through `searchParams`.
 */

const fakes = vi.hoisted(() => ({ getAppDisplayTimeZone: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));
vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'https://test.bersoncare.ru' } }));

import PublicBookDonePage from './page';

function searchParamsFor(params: Record<string, string>) {
  return { searchParams: Promise.resolve(params) };
}

describe('GET /book/done — public booking success screen', () => {
  it('дано: полный набор параметров завершённой публичной записи → когда рендерится страница → тогда видно услугу, дату/время, место и кнопки добавления в календарь', async () => {
    fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');

    const element = await PublicBookDonePage(
      searchParamsFor({
        bookingId: 'a1111111-1111-4111-8111-111111111111',
        slotStart: '2026-08-20T07:00:00.000Z',
        slotEnd: '2026-08-20T07:30:00.000Z',
        serviceTitle: 'Консультация невролога',
        locationLabel: 'TEST филиал A',
      }),
    );
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Запись подтверждена');
    expect(html).toContain('Консультация невролога');
    expect(html).toContain('TEST филиал A');
    expect(html).toContain('Добавить в календарь');
    expect(html).toContain('Google Календарь');
    expect(html).toContain('Яндекс Календарь');
    expect(html).toContain('.ics');
    // Public booker has no session-only "Новая запись" hub — the primary CTA sends them back to /book.
    expect(html).toContain('href="/book"');
  });

  it('дано: страницу открыли напрямую без параметров записи → когда рендерится → тогда редирект на /book вместо пустого/сфабрикованного экрана успеха', async () => {
    fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');

    await expect(PublicBookDonePage(searchParamsFor({}))).rejects.toThrow('REDIRECT:/book');
  });
});
