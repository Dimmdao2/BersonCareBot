/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY } from '@/modules/system-settings/platformIntegrationAvailability';
import { PlatformIntegrationAvailabilitySection } from './PlatformIntegrationAvailabilitySection';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

describe('PlatformIntegrationAvailabilitySection', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('explains platform availability versus future tariff-gated clinic credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            settings: [
              {
                key: 'platform_integration_availability',
                valueJson: { value: DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    render(<PlatformIntegrationAvailabilitySection />);

    expect(await screen.findByText(/Глобальный рубильник определяет/)).toBeInTheDocument();
    expect(screen.getByText(/собственные креды клиника добавляет локально/)).toBeInTheDocument();
    expect(
      screen.getByText(/Только объявлено: включение сохраняет выбор платформы/),
    ).toBeInTheDocument();
    const switches = await screen.findAllByRole('switch');
    await waitFor(() => expect(switches[0]).toBeEnabled());
    expect(switches).toHaveLength(7);
    expect(switches[5]).toBeChecked();
    expect(switches[6]).not.toBeChecked();
  });

  it('patches the complete versioned setting without changing other switches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            settings: [
              {
                key: 'platform_integration_availability',
                valueJson: { value: DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PlatformIntegrationAvailabilitySection />);
    const yandexCalendarSwitch = (await screen.findAllByRole('switch'))[6]!;
    await waitFor(() => expect(yandexCalendarSwitch).toBeEnabled());
    await userEvent.click(yandexCalendarSwitch);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    );
    expect(body.key).toBe('platform_integration_availability');
    expect(body.value).toEqual({
      ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY,
      integrations: {
        ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations,
        yandex_calendar: true,
      },
    });
  });
});
