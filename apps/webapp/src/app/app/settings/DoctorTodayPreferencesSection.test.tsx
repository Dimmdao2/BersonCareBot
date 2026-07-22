/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorTodayPreferencesSection } from './DoctorTodayPreferencesSection';

const apiJsonMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/apiJson', () => ({ apiJson: apiJsonMock }));

describe('DoctorTodayPreferencesSection', () => {
  beforeEach(() => {
    apiJsonMock.mockReset().mockResolvedValue({ ok: true });
  });

  it('writes the exact per-organization Today preference contract', async () => {
    const user = userEvent.setup();
    render(
      <DoctorTodayPreferencesSection
        initialPreferences={{
          visibleProactiveInsightKinds: ['wellbeing_low_streak', 'program_inactivity'],
          peopleListMode: 'on_support',
        }}
        settingsEndpoint="/api/admin/settings"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(screen.getByText('На сопровождении')).toBeInTheDocument();
    await user.click(screen.getAllByRole('switch')[0]!);

    await waitFor(() => expect(apiJsonMock).toHaveBeenCalledTimes(1));
    const [, request] = apiJsonMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      key: 'doctor_today_preferences',
      value: {
        value: {
          visibleProactiveInsightKinds: ['program_inactivity'],
          peopleListMode: 'on_support',
        },
      },
    });
  });
});
