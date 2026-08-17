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
