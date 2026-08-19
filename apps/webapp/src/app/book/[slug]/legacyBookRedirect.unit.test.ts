/**
 * Разворот адреса `/book/{slug}` → `/{slug}/booking` (владелец 19.08).
 *
 * Проверяется то, что ломается молча: ссылки в письмах подтверждения записи уже разосланы, и
 * старый адрес обязан открыться, а не отдать 404. Плюс алиас: клиника, сменившая адрес, вечно
 * держит старый — и он обязан приводить к ТЕКУЩЕМУ адресу за один прыжок.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fakes = vi.hoisted(() => ({
  resolve: vi.fn(),
  permanentRedirect: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { redirectTo: url });
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect: fakes.permanentRedirect,
  notFound: fakes.notFound,
}));
vi.mock('../publicOrganizationBooking', () => ({
  resolvePublicOrganizationBySlugRsc: fakes.resolve,
}));

const { default: LegacyBookRedirect } = await import('./page');

async function redirectTarget(slug: string): Promise<string> {
  try {
    await LegacyBookRedirect({ params: Promise.resolve({ slug }) });
  } catch (error) {
    const target = (error as { redirectTo?: string }).redirectTo;
    if (target) return target;
    throw error;
  }
  throw new Error('expected a redirect');
}

describe('GET /book/{slug}', () => {
  beforeEach(() => vi.clearAllMocks());

  it('старая ссылка из письма ведёт на новый адрес записи', async () => {
    fakes.resolve.mockResolvedValue({
      organizationId: 'org',
      canonicalSlug: 'tochka',
      disposition: 'current',
    });
    expect(await redirectTarget('tochka')).toBe('/tochka/booking');
  });

  it('алиас прежнего адреса клиники ведёт на её ТЕКУЩИЙ адрес', async () => {
    fakes.resolve.mockResolvedValue({
      organizationId: 'org',
      canonicalSlug: 'novoe-imya',
      disposition: 'redirect',
    });
    expect(await redirectTarget('staroe-imya')).toBe('/novoe-imya/booking');
  });

  it('неизвестная клиника — 404, а не редирект в никуда', async () => {
    fakes.resolve.mockResolvedValue(null);
    await expect(
      LegacyBookRedirect({ params: Promise.resolve({ slug: 'ne-sushchestvuet' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fakes.permanentRedirect).not.toHaveBeenCalled();
  });
});
