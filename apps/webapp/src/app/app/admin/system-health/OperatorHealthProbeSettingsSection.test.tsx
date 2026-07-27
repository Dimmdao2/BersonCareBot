/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OperatorHealthProbeSettingsSection } from './OperatorHealthProbeSettingsSection';

describe('OperatorHealthProbeSettingsSection', () => {
  it('renders current and code-default values and marks Rubitime retired', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                settings: [
                  {
                    key: 'operator_health_probe_config',
                    valueJson: {
                      value: {
                        max: {
                          enabled: true,
                          intervalMs: 900000,
                          timeoutMs: 6000,
                          consecutiveFailures: 3,
                        },
                        telegram: {
                          enabled: true,
                          intervalMs: 600000,
                          timeoutMs: 5000,
                          consecutiveFailures: 2,
                        },
                        google_calendar: {
                          enabled: false,
                          intervalMs: 600000,
                          timeoutMs: 5000,
                          consecutiveFailures: 2,
                        },
                        quietUntil: null,
                      },
                    },
                  },
                ],
              }),
            ),
        }),
    );
    render(<OperatorHealthProbeSettingsSection />);
    await waitFor(() => expect(screen.getByDisplayValue('15')).toBeInTheDocument());
    expect(screen.getAllByText(/По умолчанию:/).length).toBeGreaterThanOrEqual(9);
    expect(screen.getByRole('button', { name: 'Сбросить на дефолт' })).toBeInTheDocument();
    expect(screen.getByText(/Rubitime/)).toBeInTheDocument();
    expect(screen.getByText(/выведена из эксплуатации/)).toBeInTheDocument();
  });
});
