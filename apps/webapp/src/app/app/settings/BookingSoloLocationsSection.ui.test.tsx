import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ apiJson: vi.fn() }));

vi.mock('@/shared/lib/apiJson', () => ({ apiJson: fakes.apiJson }));

import { BookingSoloLocationsSection } from './BookingSoloLocationsSection';

type Branch = {
  id: string;
  title: string;
  shortTitle: string | null;
  color: string | null;
  cityCode: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
};

/**
 * The product sentence a tariff-blocked action shows across the cabinet; pinned identically in
 * `src/app/api/tariffMechanicsRefusals.ui.test.tsx`.
 */
const TARIFF_REFUSAL_SENTENCE =
  'Невозможно выполнить действие: этот раздел не входит в ваш тариф. ' +
  'Чтобы выполнить действие, включите этот раздел в тарифе клиники.';

function branch(overrides: Partial<Branch> & Pick<Branch, 'id' | 'title' | 'cityCode'>): Branch {
  return {
    shortTitle: null,
    color: '#2563eb',
    address: null,
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

/**
 * Fake booking-engine backend: `/overview` always answers from the current store, so a POST that
 * really persisted is visible to the next read. Any staleness in the rendered list is therefore
 * the component's, not the fake's.
 */
function installFakeBookingEngine(initial: Branch[]): Branch[] {
  const store: Branch[] = [...initial];
  fakes.apiJson.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/overview')) {
      return {
        ok: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', title: 'Точка Здоровья' },
        branches: store.map((row) => ({ ...row })),
        specialists: [{ id: 'spec-1', fullName: 'Дмитрий Берсон', isActive: true }],
        services: [],
        specialistAvailability: [],
        locationAvailability: [],
      };
    }
    if (url.endsWith('/branches') && options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as Partial<Branch>;
      const created = branch({
        id: `branch-${store.length + 1}`,
        title: String(body.title),
        cityCode: String(body.cityCode),
        shortTitle: body.shortTitle ?? null,
        address: body.address ?? null,
        sortOrder: Number(body.sortOrder ?? 0),
      });
      store.push(created);
      return { ok: true, branch: created };
    }
    return { ok: true };
  });
  return store;
}

function fillNewLocation(title: string, address: string): void {
  fireEvent.change(screen.getByPlaceholderText('Название'), { target: { value: title } });
  fireEvent.change(screen.getByPlaceholderText('Адрес'), { target: { value: address } });
}

describe('BookingSoloLocationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a location the doctor just created without reloading the page', async () => {
    installFakeBookingEngine([
      branch({ id: 'online', title: 'Онлайн', cityCode: 'online', sortOrder: 0 }),
      branch({ id: 'msk', title: 'Москва. Точка Здоровья', cityCode: 'moscow', sortOrder: 1 }),
    ]);

    render(<BookingSoloLocationsSection />);
    await screen.findByText('Москва. Точка Здоровья');

    fillNewLocation('Кабинет на Невском', 'Невский пр., 10');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() =>
      expect(
        fakes.apiJson.mock.calls.some(
          (call) => String(call[0]).endsWith('/branches') && call[1]?.method === 'POST',
        ),
      ).toBe(true),
    );

    expect(await screen.findByText('Кабинет на Невском')).toBeInTheDocument();
    expect(screen.queryByText('Локаций пока нет.')).not.toBeInTheDocument();
  });

  /**
   * Owner live pass 18.08, L-1. When the clinic's tariff carries no «Филиалы» quota the write is
   * refused on purpose — but the doctor was shown the raw `entitlement_required` code, which
   * explains nothing and looks like a crash.
   */
  it('shows the tariff explanation, not a machine code, when the write is refused', async () => {
    installFakeBookingEngine([
      branch({ id: 'online', title: 'Онлайн', cityCode: 'online', sortOrder: 0 }),
    ]);
    const overview = fakes.apiJson.getMockImplementation()!;
    fakes.apiJson.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/branches') && options?.method === 'POST') {
        // What `apiJson` throws for the route's 403 body once it carries the explanation.
        throw new Error(TARIFF_REFUSAL_SENTENCE);
      }
      return overview(url, options);
    });

    render(<BookingSoloLocationsSection />);
    await screen.findByText('Локаций пока нет.');

    fillNewLocation('Кабинет на Невском', 'Невский пр., 10');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText(TARIFF_REFUSAL_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText('entitlement_required')).not.toBeInTheDocument();
  });
});
