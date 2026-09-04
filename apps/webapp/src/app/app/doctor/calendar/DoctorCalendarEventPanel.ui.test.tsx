import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

vi.mock('./DoctorCalendarPatientSearch', () => ({
  DoctorCalendarPatientSearch: ({ value }: { value?: { displayName: string } | null }) => (
    <div data-testid="patient-search">{value?.displayName}</div>
  ),
}));
vi.mock('@/shared/ui/doctor/DoctorDateTimePicker', () => ({
  DoctorDateTimePicker: ({ value }: { value: string }) => (
    <input aria-label="Начало" readOnly value={value} />
  ),
}));

import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
} from '@/modules/booking-calendar/types';
import { AppointmentPaymentSection } from './AppointmentPaymentSection';
import { DoctorCalendarEventPanel } from './DoctorCalendarEventPanel';

const SPECIALIST_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('clinic calendar create form', () => {
  it('starts with the patient supplied by the host already selected', async () => {
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
        createInitialPatient={{
          id: 'patient-1',
          displayName: 'Иванова Мария',
          firstName: 'Мария',
          lastName: 'Иванова',
          phone: '+79990000000',
        }}
      />,
    );

    expect(await screen.findByTestId('patient-search')).toHaveTextContent('Иванова Мария');
  });

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
    expect(screen.getByLabelText('Сеанс')).toHaveValue('Приём');

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

  // APPT-FORM-07: селектор специалиста прячется только тогда, когда выбирать НЕ ИЗ ЧЕГО —
  // сервер вернул ровно одного специалиста клиники. Пустой список специалистов означает
  // «сервер их не отдал», и подменять это скрытым полем нельзя: врач должен видеть поле
  // и честную пустоту.
  it.each([
    { specialists: [] as { id: string; displayLabel: string }[], visible: true },
    { specialists: [{ id: SPECIALIST_ID, displayLabel: 'Доктор Иванов' }], visible: false },
  ])('keeps the specialist field for $specialists.length clinic specialists', async (scenario) => {
    render(
      <DoctorCalendarEventPanel
        apiBase="/api/doctor/booking-engine"
        selected={null}
        timeZone="Europe/Moscow"
        filterMeta={{
          specialists: [{ id: SPECIALIST_ID, label: 'Доктор Иванов' }],
          branches: [{ id: BRANCH_ID, label: 'Центр' }],
          rooms: [],
          services: [],
        }}
        activeFilters={{ specialistId: null, branchId: null, roomId: null, serviceId: null }}
        ownSpecialistId={SPECIALIST_ID}
        clinicSpecialists={scenario.specialists}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        startInCreate
      />,
    );

    await screen.findByLabelText('Филиал');
    expect(screen.queryByLabelText('Специалист') !== null).toBe(scenario.visible);
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
    expect(screen.getByLabelText('Сеанс')).toHaveValue('Приём');
    expect(screen.getByLabelText('Начало')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const shown = await screen.findByText(/Укажите/);
    expect(shown).toHaveTextContent('начало записи');
    expect(shown).not.toHaveTextContent('филиал');
    expect(shown).not.toHaveTextContent('сеанс');
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
  paymentsEntitled?: boolean;
  onlinePaymentAvailable?: boolean;
  patientChatAvailable?: boolean;
};

/** The block only exists for an entitled clinic, so every fixture states that fact explicitly. */
function paymentResponse(body: PaymentGetResponse): Response {
  return Response.json(
    { paymentsEntitled: true, onlinePaymentAvailable: true, ...body },
    { status: 200 },
  );
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
    // Nothing left to collect: the single collect action is absent, not a dead grey control.
    expect(screen.queryByRole('button', { name: 'Принять оплату' })).not.toBeInTheDocument();
  });

  it('renders no payment block at all when the clinic tariff does not carry payments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            summary: { prepaymentQuote: null, payment: null },
            totalMinor: 10_000,
            manualPaidMinor: 0,
            paymentsEntitled: false,
            onlinePaymentAvailable: false,
          },
          { status: 200 },
        ),
      ),
    );

    render(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-1" />,
    );

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.queryByLabelText('Оплата записи')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Принять оплату' })).not.toBeInTheDocument();
  });

  it('offers no online option when the read reports no configured provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        paymentResponse({
          summary: { prepaymentQuote: null, payment: null },
          totalMinor: 10_000,
          manualPaidMinor: 0,
          onlinePaymentAvailable: false,
        }),
      ),
    );

    render(
      <AppointmentPaymentSection apiBase="/api/doctor/booking-engine" appointmentId="appointment-1" />,
    );
    await screen.findByText('Не оплачено');
    fireEvent.click(screen.getByRole('button', { name: 'Принять оплату' }));

    // Cash still works without a provider; the invoice/QR/link path must not be offered at all,
    // otherwise the doctor promises a patient a link the provider cannot issue.
    expect(await screen.findByRole('button', { name: 'Оплачено наличными' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выставить счёт' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'QR-код платёжной ссылки' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Принять оплату' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Выставить счёт' }));

    const link = await screen.findByRole('link', { name: checkoutUrl });
    expect(link).toHaveAttribute('href', checkoutUrl);
    const qr = screen.getByRole('img', { name: 'QR-код платёжной ссылки' });
    expect(qr).toHaveAttribute('src', expect.stringMatching(/^data:image\/svg\+xml,/));
    expect(qr).not.toHaveAttribute('src', expect.stringContaining(checkoutUrl));
    expect(qr).not.toHaveAttribute('src', expect.stringMatching(/^https?:/));

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

/**
 * Owner acceptance 2026-09-04, риск режима «Изменить»: сохранение не подменяется молчаливым
 * частичным обновлением — ошибка любого из существующих endpoint видна пользователю, а состояние
 * не выглядит сохранённым. Дата/время идут в `manual-reschedule`, комментарий — в `comments`;
 * это два разных запроса, и второй из них раньше терялся без следа.
 */
const EDITABLE_APPOINTMENT: CalendarAppointmentEvent = {
  kind: 'appointment',
  id: '44444444-4444-4444-8444-444444444444',
  startAt: '2027-03-10T09:00:00+03:00',
  endAt: '2027-03-10T09:30:00+03:00',
  status: 'confirmed',
  source: 'staff',
  specialistId: SPECIALIST_ID,
  specialistName: 'Доктор Иванов',
  branchId: BRANCH_ID,
  branchTitle: 'Центр',
  branchColor: null,
  roomId: null,
  roomTitle: null,
  serviceId: SERVICE_ID,
  serviceTitle: 'Приём',
  platformUserId: null,
  patientName: 'Иванова Мария',
  patientPhone: null,
  bookingStatus: null,
  paymentStatus: null,
  prepaymentPending: false,
  packageUsageRef: null,
  packageTitle: null,
  packageDisplayNumber: null,
  rescheduleCount: 0,
  originalStartAt: null,
  formComments: [],
};

const EDIT_FILTER_META: CalendarFilterMeta = {
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
};

/** Расписание сохраняется, комментарий — нет: ровно та развилка, которую проверяет владелец. */
function stubEditEndpoints(commentPost: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      if (url.endsWith('/lifecycle')) {
        return Response.json({ ok: true, reschedules: [], cancellations: [] }, { status: 200 });
      }
      if (url.endsWith('/comments') && method === 'GET') {
        return Response.json(
          { ok: true, comments: [{ id: 'c1', body: 'Старый', createdAt: '2027-03-01T00:00:00Z' }] },
          { status: 200 },
        );
      }
      if (url.endsWith('/comments')) return commentPost();
      if (url.endsWith('/manual-reschedule')) return Response.json({ ok: true }, { status: 200 });
      return Response.json({ paymentsEntitled: false }, { status: 200 });
    }),
  );
  return calls;
}

function renderEditablePanel(onChanged: () => void = vi.fn()) {
  return render(
    <DoctorCalendarEventPanel
      apiBase="/api/doctor/booking-engine"
      selected={EDITABLE_APPOINTMENT}
      timeZone="Europe/Moscow"
      filterMeta={EDIT_FILTER_META}
      activeFilters={{ specialistId: null, branchId: null, roomId: null, serviceId: null }}
      ownSpecialistId={SPECIALIST_ID}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  );
}

describe('appointment edit save', () => {
  it('does not report a save when the comment endpoint rejects it', async () => {
    stubEditEndpoints(() => Response.json({ ok: false, error: 'boom' }, { status: 500 }));
    renderEditablePanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    fireEvent.change(await screen.findByLabelText('Комментарий'), {
      target: { value: 'Новый комментарий' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/comments')),
      ).toBe(true),
    );
    // Сохранился только перенос; объявлять запись сохранённой и терять набранный текст нельзя.
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Новый комментарий')).toBeInTheDocument();
  });

  it('sends the cleared comment through the contract and does not report a save when it is rejected', async () => {
    stubEditEndpoints(() => Response.json({ ok: false, error: 'boom' }, { status: 500 }));
    const onChanged = vi.fn();
    renderEditablePanel(onChanged);

    fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    const editComment = await screen.findByLabelText('Комментарий');
    await waitFor(() => expect(editComment).toHaveValue('Старый'));
    fireEvent.change(editComment, { target: { value: '' } });
    // Расписание меняется тоже: так у сохранения есть сетевой шаг, по которому виден его конец.
    fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const rescheduled = () =>
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/manual-reschedule'));
    await waitFor(() => expect(rescheduled()).toBe(true));
    // Очистка обязана уйти в тот же контракт комментария, а не пропасть по дороге...
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/comments') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^(Сохранить|Изменить)$/ })).toBeEnabled(),
    );
    // ...и её отказ не имеет права выглядеть как сохранённая запись.
    expect(toastMock.success).not.toHaveBeenCalled();
    // Применённый перенос не отменяет ошибку: календарю нельзя отдавать сигнал «готово»,
    // он закрывает панель и уносит сообщение с экрана — форма обязана остаться открытой.
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Длительность, мин')).toBeInTheDocument();

    // Повтор «Сохранить» дожимает только упавший шаг: перенос уже применён, второй раз
    // отправлять его нельзя — это ещё один перенос записи в истории пациента.
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.filter(
          ([url, init]) =>
            String(url).endsWith('/comments') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toHaveLength(2),
    );
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/manual-reschedule')),
    ).toHaveLength(1);
  });
  // Мотивирующий путь владельца: сервер принял все шаги правки записи. Ловит поломку
  // «врач сохранил, а результат уехал вместе с закрытой формой»: успех обязан уйти
  // во всплывающее уведомление, вложенный слой правки — закрыться, детали — обновиться.
  it('announces a fully accepted edit through the toast, leaves the edit layer and refreshes details', async () => {
    stubEditEndpoints(() => Response.json({ ok: true }, { status: 200 }));
    const onChanged = vi.fn();
    renderEditablePanel(onChanged);

    fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }));
    const editComment = await screen.findByLabelText('Комментарий');
    await waitFor(() => expect(editComment).toHaveValue('Старый'));
    fireEvent.change(editComment, { target: { value: 'Новый комментарий' } });
    fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // Результат объявлен именно уведомлением, а не строкой в теле формы.
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(toastMock.error).not.toHaveBeenCalled();
    // Слой правки закрыт: вернулся просмотр записи, а не остался редактор.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Длительность, мин')).not.toBeInTheDocument();
    // Детали перечитываются — иначе врач смотрит на устаревшую запись.
    expect(onChanged).toHaveBeenCalled();
  });
});
