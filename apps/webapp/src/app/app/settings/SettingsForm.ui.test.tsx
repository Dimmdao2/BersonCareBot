import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsForm } from './SettingsForm';

afterEach(() => vi.unstubAllGlobals());

describe('clinic-owner cabinet settings form', () => {
  it('exposes SMS fallback alongside comments and media settings', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        items: Array<{ key: string; value: { value: boolean } }>;
      };
      return {
        ok: true,
        json: async () => ({
          ok: true,
          settings: request.items.map((item) => ({
            key: item.key,
            valueJson: item.value,
          })),
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SettingsForm
        patientLabel="пациент"
        supportCommentsWithoutSupportDefault={false}
        supportMediaWithoutSupportDefault
        showPatientLabel={false}
      />,
    );

    expect(screen.getByText(/SMS/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as { items: Array<{ key: string }> };
    expect(body.items.map((item) => item.key)).toEqual([
      'doctor_patient_support_comments_without_support_default_enabled',
      'doctor_patient_support_media_without_support_default_enabled',
    ]);
    expect(body.items.map((item) => item.key)).toContain('sms_fallback_enabled');
    await waitFor(() => expect(screen.queryByText('Не удалось сохранить настройки')).toBeNull());
  });
});
