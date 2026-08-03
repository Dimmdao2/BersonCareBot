import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientMembershipsSection } from './PatientMembershipsSection';

const packageRow = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Абонемент на консультации',
  status: 'awaiting_payment',
  priceMinor: 5000,
  currency: 'RUB',
  validUntil: null,
  paymentIntentId: 'payment-intent-1',
  balance: { items: [] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PatientMembershipsSection', () => {
  it('does not offer payment when tariff mutations are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ok: true, packages: [packageRow] })),
    );

    render(
      <PatientMembershipsSection subscriptionsMutationsAllowed paymentsMutationsAllowed={false} />,
    );

    await waitFor(() => expect(screen.getByText(packageRow.title)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Оплатить' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подробнее' })).toBeInTheDocument();
  });
});
