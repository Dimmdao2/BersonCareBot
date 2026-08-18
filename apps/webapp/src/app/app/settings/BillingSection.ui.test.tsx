import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingSection } from './BillingSection';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyBilling = {
  organizationId: 'org',
  billingEmail: null,
  subscriptions: [],
  invoices: [],
  providerEvents: [],
};
const tariffChange = {
  choices: [],
  currentTariffId: null,
  pendingTariffId: null,
  pendingEffectiveAt: null,
  awaitingFirstPayment: false,
  payable: true,
};

describe('§5a stage 6.1 — clinic sees "used out of included" per number', () => {
  it('sends PATCH to schedule the selected downgrade and DELETE to cancel it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetch);
    render(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[]}
        billing={emptyBilling}
        tariffChange={{
          choices: [{ id: 'current', name: 'Стандарт' }, { id: 'small', name: 'Базовый' }],
          currentTariffId: 'current',
          pendingTariffId: 'small',
          pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Перейти на тариф' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/clinic/billing', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ tariffId: 'small' }),
    })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отменить' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/clinic/billing', { method: 'DELETE' }));
  });

  it('shows the scheduled tariff boundary and its cancel action', () => {
    render(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[]}
        billing={emptyBilling}
        tariffChange={{
          choices: [{ id: 'current', name: 'Стандарт' }, { id: 'small', name: 'Базовый' }],
          currentTariffId: 'current',
          pendingTariffId: 'small',
          pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    expect(screen.getByText('Новый тариф вступит 01.09.2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('names the exact cleanup categories when the tariff change is refused', async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: false,
        error: 'saas_billing_tariff_downgrade_blocked',
        blocks: [{ mechanic: 'clinic_team' }, { mechanic: 'patient_count' }],
      }),
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[]}
        billing={emptyBilling}
        tariffChange={{
          choices: [{ id: 'current', name: 'Стандарт' }, { id: 'small', name: 'Базовый' }],
          currentTariffId: 'current', pendingTariffId: 'small', pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Перейти на тариф' }));

    expect(await screen.findByText('Понижение недоступно: освободите места специалистов, пациенты.')).toBeInTheDocument();
  });

  /**
   * L-11 (владелец 18.08): «она выбирает платный тариф — ИДЕТ ОПЛАЧИВАТЬ И ПОТОМ ПОЛУЧАЕТ ДОСТУП».
   * Поломка: клиника выбрала тариф, доступа нет — и экран показывает «Тариф не назначен» с советом
   * идти в админку платформы, без имени выбранного тарифа и без кнопки оплаты. Человек заперт:
   * кабинет закрыт (`unconfigured` уводит сюда), а заплатить отсюда нечем. Отказ дорогой (клиника
   * не может купить) и молчаливый (экран выглядит исправным).
   */
  it('выбранный, но не оплаченный тариф: клиника видит свой выбор и кнопку оплаты', () => {
    render(
      <BillingSection
        // Снимок прав пуст — действующего тарифа нет, доступа нет.
        tariffName={null}
        commercialStateLabel="Тариф не назначен — доступа нет. Выберите тариф в админке, чтобы вернуть работу кабинета."
        mechanics={[]}
        quotaUsage={[]}
        billing={{ ...emptyBilling, billingEmail: 'clinic@example.test' }}
        tariffChange={{
          choices: [{ id: 'chosen', name: 'Базовый' }, { id: 'other', name: 'Стандарт' }],
          currentTariffId: 'chosen',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          awaitingFirstPayment: true,
          payable: true,
        }}
      />,
    );

    expect(screen.getAllByText('Базовый').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Тариф выбран, но не оплачен — доступ откроется после оплаты.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Выберите тариф в админке/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оплатить тариф' })).toBeInTheDocument();
  });

  it('renders each configured number with its usage and limit, and hides the section when there are none', () => {
    const { rerender } = render(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[
          {
            mechanic: 'patient_count',
            label: 'Пациенты',
            quota: { limit: 25, unit: 'items' },
            usage: 25,
            threshold: 'reached',
            enforcement: 'application_transaction_snapshot',
          },
          {
            mechanic: 'branches',
            label: 'Филиалы',
            quota: { limit: 4, unit: 'items' },
            usage: 1,
            threshold: 'below_warning',
            enforcement: 'application_transaction_snapshot',
          },
          {
            mechanic: 'files',
            label: 'Файлы пациентов',
            quota: { limit: 1024 * 1024 * 10, unit: 'bytes' },
            usage: 1024 * 1024 * 8,
            threshold: 'warning',
            enforcement: 'application_transaction_snapshot',
          },
          {
            mechanic: 'clinic_team',
            label: 'Режим клиники',
            quota: { limit: 5, unit: 'seats' },
            usage: 2,
            threshold: 'below_warning',
            enforcement: 'application_transaction_snapshot',
          },
        ]}
        billing={emptyBilling}
        tariffChange={tariffChange}
      />,
    );

    expect(screen.getByText('Использовано из включённого')).toBeInTheDocument();
    expect(screen.getByText('25 из 25')).toBeInTheDocument();
    expect(screen.getByText('Предел достигнут')).toBeInTheDocument();
    expect(screen.getByText('1 из 4')).toBeInTheDocument();
    expect(screen.getByText('8.0 МБ из 10.0 МБ')).toBeInTheDocument();
    expect(screen.getByText('2 из 5')).toBeInTheDocument();

    rerender(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[]}
        billing={emptyBilling}
        tariffChange={tariffChange}
      />,
    );

    expect(screen.queryByText('Использовано из включённого')).not.toBeInTheDocument();
  });
});
