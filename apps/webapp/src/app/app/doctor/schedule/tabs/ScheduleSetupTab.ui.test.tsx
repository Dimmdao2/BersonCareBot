import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduleSetupTab } from './ScheduleSetupTab';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScheduleSetupTab product catalog', () => {
  it('shows the clinic product catalog from the packages and products section', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);

        const body = url.endsWith('/packages')
          ? { ok: true, packages: [] }
          : url.endsWith('/services')
            ? { ok: true, services: [] }
            : { ok: true, products: [] };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    render(
      <ScheduleSetupTab
        deepLinkParams={{ section: 'packages' }}
        onDeepLinkChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Абонементы и продукты' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Продукты')).toBeInTheDocument();
    await waitFor(() => {
      expect(requestedUrls).toContain('/api/doctor/booking-engine/products');
    });
  });
});
