import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialConstructorClient } from './CommercialConstructorClient';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('commercial constructor access ladder', () => {
  it('does not render retired tariff controls from legacy API data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [
            {
              id: '11111111-1111-4111-8111-111111111199',
              name: 'Legacy tariff',
              description: '',
              priceMinor: null,
              currency: null,
              billingPeriod: 'month',
              mechanics: { booking: true, clinical_tests: false, online_intake: false },
              quotas: {},
              systemAccessPolicy: null,
              mechanicAccessPolicies: { clinical_tests: null, online_intake: null },
              downgradePolicies: { clinical_tests: 'block', online_intake: 'block' },
              includedSeats: 1,
              additionalSeatPriceMinor: null,
              isActive: true,
              createdAt: '2026-08-02T00:00:00.000Z',
              updatedAt: '2026-08-02T00:00:00.000Z',
            },
          ],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);

    await screen.findByText('Legacy tariff');
    expect(screen.queryByText('Клинические тесты и наборы')).not.toBeInTheDocument();
    expect(screen.queryByText('Онлайн-анкета')).not.toBeInTheDocument();
  });

  it('starts unconfigured and exposes the owner fields in product language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    // §5a item 2.6a — «при создании тарифа по умолчанию пусть ставится одно» (owner 31.07).
    expect(screen.getByLabelText('Мест специалистов')).toHaveValue(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);

    expect(screen.getByText('Терпение: дней')).toBeInTheDocument();
    // The agent's single "number of warnings" is gone; уведомления — это список владельца.
    expect(screen.queryByText('Предупреждений')).not.toBeInTheDocument();
    // Т3 (owner 04.08) — templates no longer live inline in the tariff form; they moved to their
    // own «Уведомления» tab, so the row editor is absent here.
    expect(
      screen.queryByRole('button', { name: 'Добавить уведомление' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Только чтение: дней')).toBeInTheDocument();
    expect(screen.getByText('Затем')).toBeInTheDocument();
    expect(screen.queryByText(/квот/i)).not.toBeInTheDocument();
  });

  it('submits and reloads system and mechanic policies without replacing owner values', async () => {
    const user = userEvent.setup();
    let savedTariff: Record<string, unknown> | null = null;
    let submitted: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          const tariff = submitted.tariff as Record<string, unknown>;
          savedTariff = {
            ...tariff,
            id: '11111111-1111-4111-8111-111111111111',
            createdAt: '2026-07-30T00:00:00.000Z',
            updatedAt: '2026-07-30T00:00:00.000Z',
          };
          return { ok: true, json: async () => ({ ok: true, result: { created: true } }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: savedTariff ? [savedTariff] : [],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Тариф с политикой' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);
    fireEvent.change(screen.getByLabelText('Доступ к системе: Терпение: дней'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Доступ к системе: Только чтение: дней'), {
      target: { value: '4' },
    });
    await user.click(screen.getByLabelText('Доступ к системе: Затем'));
    await user.click(await screen.findByRole('option', { name: 'Выключено' }));
    fireEvent.change(screen.getByLabelText('Онлайн-запись: Терпение: дней'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Онлайн-запись: Только чтение: дней'), {
      target: { value: '5' },
    });
    await user.click(screen.getByLabelText('Онлайн-запись: Затем'));
    const openSelect = document.querySelector<HTMLElement>(
      '[data-slot="select-content"][data-open]',
    );
    expect(openSelect).not.toBeNull();
    await user.click(within(openSelect!).getByRole('option', { name: 'Только чтение' }));
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'create_tariff',
        tariff: {
          systemAccessPolicy: {
            graceDays: 6,
            readOnlyDays: 4,
            notifications: [],
            terminalState: 'disabled',
          },
          mechanicAccessPolicies: {
            booking: {
              graceDays: 1,
              readOnlyDays: 5,
              notifications: [],
              terminalState: 'read_only',
            },
          },
        },
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Тариф с политикой/ }));

    expect(screen.getByLabelText('Доступ к системе: Терпение: дней')).toHaveValue(6);
    expect(screen.getByLabelText('Онлайн-запись: Только чтение: дней')).toHaveValue(5);
    expect(screen.getByLabelText('Онлайн-запись: Затем')).toHaveTextContent('Только чтение');
  });

  // Т2/Т3/Т7 (owner 04.08) — templates move to their own tab with a full editor; this proves the
  // tab picks up an existing tariff's notification rows (all seven conditions offered, template
  // text rendered by the rich editor) and that editing the deadline round-trips without touching
  // the owner's template text.
  it('edits an existing notification row from the separate Уведомления tab, template preserved', async () => {
    const user = userEvent.setup();
    let submitted: Record<string, unknown> | null = null;
    const existingTariff = {
      id: '11111111-1111-4111-8111-111111111177',
      name: 'Тариф с триггерами',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: {
        graceDays: 6,
        readOnlyDays: 4,
        notifications: [
          { offsetDays: -2, condition: 'payment_failed', template: 'Оплатите {{тариф}} до {{дата}}' },
        ],
        terminalState: 'disabled',
      },
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          return { ok: true, json: async () => ({ ok: true, result: {} }) };
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tariffs: [existingTariff],
            organizations: [],
            trialPolicy: null,
            registrationTariffPolicy: { tariffId: null },
          }),
        };
      }),
    );

    render(<CommercialConstructorClient />);
    await user.click(await screen.findByRole('tab', { name: 'Уведомления' }));
    await user.click(await screen.findByRole('button', { name: /Тариф с триггерами/ }));

    // The row's template renders through the rich editor, not a stub — the owner's text is really there.
    expect(await screen.findByText(/Оплатите/)).toBeInTheDocument();
    // Т2/Т7 — all seven conditions are offered, not just the payment pair.
    expect(
      screen.getByLabelText('Доступ к системе: уведомление 1: условие'),
    ).toHaveTextContent('Ошибка оплаты');

    fireEvent.change(screen.getByLabelText('Доступ к системе: уведомление 1: срок'), {
      target: { value: '-5' },
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'update_tariff',
        tariff: {
          systemAccessPolicy: {
            notifications: [
              {
                offsetDays: -5,
                condition: 'payment_failed',
                template: 'Оплатите {{тариф}} до {{дата}}',
              },
            ],
          },
        },
      }),
    );
  });

  it('never offers "full access" as a ladder terminal state (§5a stage 4b.2 — exactly two values)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tariffs: [],
          organizations: [],
          trialPolicy: null,
          registrationTariffPolicy: { tariffId: null },
        }),
      })),
    );

    render(<CommercialConstructorClient />);
    await screen.findByRole('button', { name: 'Создать' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Настроить' })[0]!);
    fireEvent.click(screen.getByLabelText('Доступ к системе: Затем'));

    const openSelect = document.querySelector<HTMLElement>(
      '[data-slot="select-content"][data-open]',
    );
    expect(openSelect).not.toBeNull();
    expect(
      within(openSelect!).queryByRole('option', { name: 'Полный доступ' }),
    ).not.toBeInTheDocument();
    expect(within(openSelect!).getByRole('option', { name: 'Только чтение' })).toBeInTheDocument();
    expect(within(openSelect!).getByRole('option', { name: 'Выключено' })).toBeInTheDocument();
  });
});
