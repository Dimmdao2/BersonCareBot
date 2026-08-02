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
    expect(screen.getByText('Уведомления')).toBeInTheDocument();
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
    // §5a item 2.6a — the owner adds notification rows himself; there is no fixed number.
    await user.click(screen.getAllByRole('button', { name: 'Добавить уведомление' })[0]!);
    fireEvent.change(screen.getByLabelText('Доступ к системе: уведомление 1: срок'), {
      target: { value: '-2' },
    });
    fireEvent.change(screen.getByLabelText('Доступ к системе: уведомление 1: текст'), {
      target: { value: 'Оплатите {{тариф}} до {{дата}}' },
    });
    await user.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        action: 'create_tariff',
        tariff: {
          systemAccessPolicy: {
            graceDays: 6,
            readOnlyDays: 4,
            notifications: [
              {
                offsetDays: -2,
                condition: 'payment_failed',
                template: 'Оплатите {{тариф}} до {{дата}}',
              },
            ],
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
    expect(screen.getByLabelText('Доступ к системе: уведомление 1: срок')).toHaveValue(-2);
    expect(screen.getByLabelText('Доступ к системе: уведомление 1: текст')).toHaveValue(
      'Оплатите {{тариф}} до {{дата}}',
    );
    expect(screen.getByLabelText('Онлайн-запись: Только чтение: дней')).toHaveValue(5);
    expect(screen.getByLabelText('Онлайн-запись: Затем')).toHaveTextContent('Только чтение');
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
