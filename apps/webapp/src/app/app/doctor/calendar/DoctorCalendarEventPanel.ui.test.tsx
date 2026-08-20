import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./DoctorCalendarPatientSearch', () => ({
  DoctorCalendarPatientSearch: () => <div data-testid="patient-search" />,
}));
vi.mock('@/shared/ui/doctor/DoctorDateTimePicker', () => ({
  DoctorDateTimePicker: ({ value }: { value: string }) => (
    <input aria-label="Начало" readOnly value={value} />
  ),
}));

import { AppointmentPaymentSection } from './AppointmentPaymentSection';
import { DoctorCalendarEventPanel } from './DoctorCalendarEventPanel';

const SPECIALIST_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => vi.unstubAllGlobals());

describe('clinic calendar create form', () => {
  it('renders canonical specialist/branch/service fields and submits their exact ids', async () => {
    const onChanged = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, appointment: { id: 'appointment-1' } }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorCalendarEventPanel
        apiBase="/api/doctor/booking-engine"
        selected={null}
        timeZone="Europe/Moscow"
        filterMeta={{
          specialists: [{ id: SPECIALIST_ID, label: 'Доктор Иванов' }],
          branches: [{ id: BRANCH_ID, label: 'Центр' }],
          rooms: [],
          services: [
            {
              id: SERVICE_ID,
              label: 'Приём',
              durationMinutes: 30,
              availability: [{ specialistId: SPECIALIST_ID, branchId: BRANCH_ID }],
            },
          ],
        }}
        activeFilters={{ specialistId: null, branchId: null, roomId: null, serviceId: null }}
        ownSpecialistId={SPECIALIST_ID}
        onClose={vi.fn()}
        onChanged={onChanged}
        startInCreate
        createInitialStart="2027-03-10T09:00"
        createInitialSpecialistId={SPECIALIST_ID}
        createInitialBranchId={BRANCH_ID}
        createInitialServiceId={SERVICE_ID}
      />,
    );

    expect(await screen.findByLabelText('Специалист')).toHaveValue('Доктор Иванов');
    expect(screen.getByLabelText('Филиал')).toHaveValue('Центр');
    expect(screen.getByLabelText('Услуга')).toHaveValue('Приём');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchMock).mock.calls[0]!;
    expect(String(url)).toBe('/api/doctor/booking-engine/appointments/manual');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      specialistId: SPECIALIST_ID,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
  });

  // Owner live pass 18.08 (L-9): everything picked except the start time, and the form answered
  // «Заполните филиал, услугу и специалиста» — so the owner concluded the selectors were missing.
  it('names the empty start time instead of blaming the filled branch/service/specialist', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorCalendarEventPanel
        apiBase="/api/doctor/booking-engine"
        selected={null}
        timeZone="Europe/Moscow"
        filterMeta={{
          specialists: [{ id: SPECIALIST_ID, label: 'Доктор Иванов' }],
          branches: [{ id: BRANCH_ID, label: 'Центр' }],
          rooms: [],
          services: [
            {
              id: SERVICE_ID,
              label: 'Приём',
              durationMinutes: 30,
              availability: [{ specialistId: SPECIALIST_ID, branchId: BRANCH_ID }],
            },
          ],
        }}
        activeFilters={{ specialistId: null, branchId: null, roomId: null, serviceId: null }}
        ownSpecialistId={SPECIALIST_ID}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        startInCreate
        createInitialSpecialistId={SPECIALIST_ID}
        createInitialBranchId={BRANCH_ID}
        createInitialServiceId={SERVICE_ID}
      />,
    );

    expect(await screen.findByLabelText('Специалист')).toHaveValue('Доктор Иванов');
    expect(screen.getByLabelText('Филиал')).toHaveValue('Центр');
    expect(screen.getByLabelText('Услуга')).toHaveValue('Приём');
    expect(screen.getByLabelText('Начало')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const shown = await screen.findByText(/Укажите/);
    expect(shown).toHaveTextContent('начало записи');
    expect(shown).not.toHaveTextContent('филиал');
    expect(shown).not.toHaveTextContent('услугу');
    expect(shown).not.toHaveTextContent('специалиста');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains which required clinic catalog is empty instead of hiding the required fields', async () => {
    vi.stubGlobal('fetch', vi.fn());

    render(
      <DoctorCalendarEventPanel
        apiBase="/api/doctor/booking-engine"
        selected={null}
        timeZone="Europe/Moscow"
        filterMeta={{ specialists: [], branches: [], rooms: [], services: [] }}
        activeFilters={{ specialistId: null, branchId: null, roomId: null, serviceId: null }}
        ownSpecialistId={null}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        startInCreate
        createInitialStart="2027-03-10T09:00"
      />,
    );

    expect(await screen.findByText('Нет доступных специалистов.')).toBeInTheDocument();
    expect(screen.getByText('Нет доступных филиалов.')).toBeInTheDocument();
    expect(screen.getByText('Сначала выберите специалиста и филиал.')).toBeInTheDocument();
  });
});

type PaymentGetResponse = {
  summary: {
    prepaymentQuote: { amountMinor: number; currency: string } | null;
    payment: { amountMinor: number; status: string } | null;
  };
  totalMinor: number | null;
  manualPaidMinor: number;
};

function paymentResponse(body: PaymentGetResponse): Response {
  return Response.json(body, { status: 200 });
}

describe('appointment payment owner states', () => {
  it.each([
    {
      label: 'none',
      response: {
        summary: { prepaymentQuote: null, payment: null },
        totalMinor: 10_000,
        manualPaidMinor: 0,
      },
      expected: 'Не оплачено',
      expectedNumbers: [] as string[],
    },
    {
      label: 'partial',
      response: {
        summary: {
          prepaymentQuote: null,
          payment: { amountMinor: 2_500, status: 'succeeded' },
        },
        totalMinor: 10_000,
        manualPaidMinor: 1_000,
      },
      expected: 'Частично оплачено:',
      expectedNumbers: ['35', '100', '65'],
    },
    {
      label: 'paid',
      response: {
        summary: {
          prepaymentQuote: null,
          payment: { amountMinor: 12_000, status: 'succeeded' },
        },
        totalMinor: 10_000,
        manualPaidMinor: 0,
      },
      expected: 'Оплачено:',
      expectedNumbers: ['120'],
    },
  ])('renders the $label state from actual captured and cash amounts', async ({
    response,
    expected,
    expectedNumbers,
  }) => {
    vi.stubGlobal('fetch', vi.fn(async () => paymentResponse(response)));

    const { unmount } = render(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-1" />,
    );

    const status = await screen.findByText(new RegExp(`^${expected}`));
    for (const expectedNumber of expectedNumbers) {
      expect(status).toHaveTextContent(expectedNumber);
    }
    if (response.manualPaidMinor + (response.summary.payment?.amountMinor ?? 0) < 10_000) {
      expect(screen.queryByText(/^Оплачено:/)).not.toBeInTheDocument();
    }
    unmount();
  });

  it('treats a zero-price appointment as having zero remaining, not as unpaid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        paymentResponse({
          summary: { prepaymentQuote: null, payment: null },
          totalMinor: 0,
          manualPaidMinor: 0,
        }),
      ),
    );

    render(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-free" />,
    );

    expect(await screen.findByText(/^Оплачено:/)).toHaveTextContent('0');
    expect(screen.queryByText('Не оплачено')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оплачено наличными' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Выставить счёт' })).toBeDisabled();
  });

  it('keeps the QR on the server-returned URL and clears that identity when the appointment changes', async () => {
    const getByAppointment = new Map([
      [
        'appointment-1',
        {
          summary: { prepaymentQuote: null, payment: null },
          totalMinor: 10_000,
          manualPaidMinor: 0,
        } satisfies PaymentGetResponse,
      ],
      [
        'appointment-2',
        {
          summary: { prepaymentQuote: null, payment: null },
          totalMinor: 20_000,
          manualPaidMinor: 0,
        } satisfies PaymentGetResponse,
      ],
    ]);
    const checkoutUrl = 'https://pay.example.test/appointment-1?token=one';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const appointmentId = url.includes('appointment-2') ? 'appointment-2' : 'appointment-1';
        if (init?.method === 'POST') {
          return Response.json({ ok: true, paymentLink: checkoutUrl }, { status: 200 });
        }
        return paymentResponse(getByAppointment.get(appointmentId)!);
      }),
    );

    const { rerender } = render(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-1" />,
    );
    await screen.findByText('Не оплачено');
    fireEvent.click(screen.getByRole('button', { name: 'Выставить счёт' }));

    const link = await screen.findByRole('link', { name: checkoutUrl });
    expect(link).toHaveAttribute('href', checkoutUrl);
    expect(screen.getByRole('img', { name: 'QR-код платёжной ссылки' })).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(checkoutUrl)),
    );

    rerender(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-2" />,
    );
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('appointment-2'))).toBe(
        true,
      ),
    );
    expect(screen.queryByRole('link', { name: checkoutUrl })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'QR-код платёжной ссылки' })).not.toBeInTheDocument();
  });
});
