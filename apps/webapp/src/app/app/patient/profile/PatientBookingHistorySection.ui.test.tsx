import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientBookingHistorySection } from './PatientBookingHistorySection';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PatientBookingHistorySection', () => {
  it('keeps the purchases page substantive when there are no payments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, timeline: [], payments: [], visits: [] }),
      ),
    );

    render(<PatientBookingHistorySection mode="payments" />);

    await waitFor(() => expect(screen.getByText('Оплат пока нет')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Оплаты' })).toBeInTheDocument();
  });
});
