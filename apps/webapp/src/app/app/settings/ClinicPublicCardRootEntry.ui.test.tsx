// @vitest-environment jsdom

/**
 * Независимый аудит пункта `B5a`: настройка «сразу вход, визитку не показывать» в кабинете.
 *
 * Ловит: переключатель не показывает сохранённое значение, пишет не тот ключ либо оставляет
 * интерфейс включённым после отказа сервера — клиника думает, что настроила, а корень адреса
 * ведёт себя иначе.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ClinicPublicCardSettings } from '@/modules/clinic-public-card/ports';
import { ClinicPublicCardSection } from './ClinicPublicCardSection';

const CARD: ClinicPublicCardSettings = {
  description: null,
  publicContactPhone: null,
  publicContactEmail: null,
  publicWebsiteUrl: null,
  logoMediaId: null,
  photoMediaIds: [],
  cardIsPublished: true,
};

const ROOT_ENTRY_LABEL = 'Сразу открывать вход на брендированном адресе';

function fetchMock(ok: boolean) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ ok }), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock(true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('B5a · переключатель корня в настройках клиники', () => {
  it('включение пишет именно ключ настройки корня в общий порт настроек', async () => {
    const fetchSpy = fetchMock(true);
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <ClinicPublicCardSection initialSettings={CARD} skipPublicCardAtRoot={false} publicUrl={null} />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: ROOT_ENTRY_LABEL }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/settings');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      key: 'clinic_root_skip_public_card',
      value: { value: true },
    });
    // Идентификатор организации не передаётся телом: его ставит доверенный гейт маршрута.
    expect(String(init.body)).not.toContain('organizationId');
  });

  it('отказ сервера возвращает переключатель назад и говорит об этом', async () => {
    vi.stubGlobal('fetch', fetchMock(false));
    render(
      <ClinicPublicCardSection initialSettings={CARD} skipPublicCardAtRoot={false} publicUrl={null} />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: ROOT_ENTRY_LABEL }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить настройку входа'),
    );
    expect(screen.getByRole('checkbox', { name: ROOT_ENTRY_LABEL })).not.toBeChecked();
  });
});
