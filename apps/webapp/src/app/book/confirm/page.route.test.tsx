import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  loadPublicInPersonSlotContextForSlugRsc: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('../publicOrganizationBooking', () => ({
  loadPublicInPersonSlotContextForSlugRsc:
    fakes.loadPublicInPersonSlotContextForSlugRsc,
}));
vi.mock('../PublicBookingShell', () => ({
  PublicBookingShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./PublicConfirmStepClient', () => ({
  PublicConfirmStepClient: (props: {
    cityTitle?: string;
    serviceTitle?: string;
    priceMinor?: number;
    slotCount: number;
  }) => (
    <span>
      {props.cityTitle}|{props.serviceTitle}|{props.priceMinor}|{props.slotCount}
    </span>
  ),
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue('Europe/Moscow'),
}));

import PublicBookConfirmPage from './page';

describe('GET /book/confirm — canonical public service context', () => {
  it('uses the clinic catalog price and service identity instead of browser query values', async () => {
    fakes.loadPublicInPersonSlotContextForSlugRsc.mockResolvedValue({
      ok: true,
      branchId: 'b1111111-1111-4111-8111-111111111111',
      serviceId: 's1111111-1111-4111-8111-111111111111',
      cityCode: 'moscow',
      cityTitle: 'Москва. Точка Здоровья',
      serviceTitle: 'Сеанс 60 мин',
      durationMinutes: 60,
      priceMinor: 700000,
      maxConsecutiveSlotHours: 3,
      appDisplayTimeZone: 'Europe/Moscow',
    });

    const element = await PublicBookConfirmPage({
      searchParams: Promise.resolve({
        type: 'in_person',
        date: '2026-08-29',
        slot: '2026-08-29T09:00:00.000Z',
        slotEnd: '2026-08-29T11:00:00.000Z',
        slotCount: '2',
        branchId: 'b1111111-1111-4111-8111-111111111111',
        serviceId: 's1111111-1111-4111-8111-111111111111',
        orgSlug: 'tochka-zdorovya',
        cityTitle: 'Подменённый город',
        serviceTitle: 'Подменённая услуга',
        priceMinor: '1',
      }),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain('Москва. Точка Здоровья|Сеанс 60 мин|700000|2');
    expect(html).not.toContain('Подменённая');
  });
});
