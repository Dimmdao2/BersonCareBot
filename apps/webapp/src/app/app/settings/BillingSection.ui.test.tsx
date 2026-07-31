import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingSection } from './BillingSection';

afterEach(cleanup);

const emptyBilling = {
  organizationId: 'org',
  subscriptions: [],
  invoices: [],
  providerEvents: [],
};

describe('§5a stage 6.1 — clinic sees "used out of included" per number', () => {
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
      />,
    );

    expect(screen.queryByText('Использовано из включённого')).not.toBeInTheDocument();
  });
});
