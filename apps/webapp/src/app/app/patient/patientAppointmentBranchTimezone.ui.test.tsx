/**
 * PATIENT-OVERVIEW-08/09/10 (`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §P3).
 *
 * Поломка, которую ловит файл, дословно: пациент с устройством в Москве (+03) открывает свою
 * запись в филиале Екатеринбурга (+05) на 14:00 по месту, а экран показывает 12:00 — время
 * приложения, а не филиала. Человек приезжает на два часа позже и теряет приём. Отказ дорогой
 * (пропущенный визит) и молчаливый: строка выглядит нормальной, ничего не падает, ни в логах, ни
 * в тестах следа нет.
 *
 * `appointmentZoneOffset.unit.test.ts` покрывает саму арифметику смещений, а
 * `AppointmentZoneOffsetWarning.ui.test.tsx` — бейдж в изоляции. Ни один из них не падает, если
 * поверхность перестанет передавать пояс филиала и вернётся к `appDisplayTimeZone` — проверено
 * инъекцией отказа: три поверхности откачены на `appDisplayTimeZone`, 152 теста остались зелёными.
 * Здесь проверяется именно связка «поверхность → пояс филиала».
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { BookingPastHistorySection } from './booking/BookingPastHistorySection';
import { BookingDoneClient } from './booking/done/BookingDoneClient';
import { BookingSlotList } from './cabinet/BookingSlotList';
import { CabinetActiveBookings } from './cabinet/CabinetActiveBookings';

const deviceTimeZone = vi.hoisted(() => ({ current: 'Europe/Moscow' }));

vi.mock('@/shared/lib/browserCalendarIana', () => ({
  getBrowserCalendarIanaForAuth: () => deviceTimeZone.current,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

/** Пояс приложения (`system_settings.app_display_timezone`) — то, чем НЕЛЬЗЯ подменять филиал. */
const APP_DISPLAY_TIME_ZONE = 'Europe/Moscow';
/** 2026-07-15T09:00Z = 14:00 в Екатеринбурге (+05) и 12:00 в Москве (+03). */
const SLOT_START = '2026-07-15T09:00:00Z';
const SLOT_END = '2026-07-15T09:30:00Z';
const BRANCH_LOCAL = '15 июл. 2026 г., 14:00';
const APP_LOCAL = '15 июл. 2026 г., 12:00';

/** ru-RU `Intl` вставляет узкие неразрывные пробелы; сравниваем по обычным. */
function text(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/ | /g, ' ');
}

function booking(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bookingType: 'in_person',
    city: null,
    category: 'general',
    slotStart: SLOT_START,
    slotEnd: SLOT_END,
    status: 'confirmed',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: '+79990000000',
    contactEmail: null,
    contactName: 'Пациент',
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 30,
    priceMinorSnapshot: null,
    canonicalAppointmentId: 'appt-1',
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    canonicalInPersonContext: {
      branchId: 'branch-1',
      serviceId: 'service-1',
      cityCode: 'ekb',
      branchTitle: 'Филиал на Ленина',
      serviceTitle: 'Консультация',
      durationMinutes: 30,
      priceMinor: 500000,
      timezone: 'Asia/Yekaterinburg',
    },
    ...overrides,
  };
}

beforeEach(() => {
  deviceTimeZone.current = 'Europe/Moscow';
});

afterEach(() => {
  cleanup();
});

describe('PATIENT-OVERVIEW-08: время записи на пациентских поверхностях — по поясу филиала', () => {
  it('кабинет, активные записи: 14:00 по Екатеринбургу, а не 12:00 по поясу приложения', () => {
    const { container } = render(
      <CabinetActiveBookings
        bookings={[booking()]}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
      />,
    );

    expect(text(container)).toContain(BRANCH_LOCAL);
    expect(text(container)).not.toContain(APP_LOCAL);
  });

  it('история посещений: та же запись в поясе филиала', () => {
    const { container } = render(
      <BookingPastHistorySection
        items={[booking({ status: 'completed' })]}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Открыть историю' }));

    expect(text(container.ownerDocument.body)).toContain(BRANCH_LOCAL);
    expect(text(container.ownerDocument.body)).not.toContain(APP_LOCAL);
  });

  it('выбор слота: время слота в поясе филиала, а не приложения', () => {
    const { container } = render(
      <BookingSlotList
        slots={[{ startAt: SLOT_START, endAt: SLOT_END }]}
        selectedSlot={null}
        onSelectSlot={() => {}}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
        branchTimeZone="Asia/Yekaterinburg"
      />,
    );

    expect(text(container)).toContain('14:00');
    expect(text(container)).not.toContain('12:00');
  });

  it('экран «Запись подтверждена»: время в поясе филиала, а не приложения', () => {
    const { container } = render(
      <BookingDoneClient
        slotStart={SLOT_START}
        slotEnd={SLOT_END}
        serviceTitle="Консультация"
        locationLabel="Филиал на Ленина"
        bookingId="booking-1"
        backToHubHref="/app/patient/booking"
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
        branchTimeZone="Asia/Yekaterinburg"
        appBaseUrl="https://example.test"
      />,
    );

    expect(text(container)).toContain('14:00');
    expect(text(container)).not.toContain('12:00');
  });

  it('легаси-строка без канонического филиала остаётся на поясе приложения и не выдаёт его за филиальный', () => {
    const { container } = render(
      <CabinetActiveBookings
        bookings={[booking({ canonicalInPersonContext: null })]}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
      />,
    );

    expect(text(container)).toContain(APP_LOCAL);
    expect(screen.queryByText('!')).not.toBeInTheDocument();
    expect(screen.queryByText(/^UTC/)).not.toBeInTheDocument();
  });
});

describe('PATIENT-OVERVIEW-09/10: предупреждение на поверхности', () => {
  it('смещения различаются — рядом со временем есть «!» и UTC+5 (кабинет)', async () => {
    deviceTimeZone.current = 'Europe/Moscow'; // +03 против +05 филиала
    render(
      <CabinetActiveBookings
        bookings={[booking()]}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
      />,
    );

    expect(await screen.findByText('UTC+5')).toBeInTheDocument();
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('смещения совпадают при разных IANA-именах — ни «!», ни UTC (кабинет)', async () => {
    deviceTimeZone.current = 'Asia/Karachi'; // +05, как и Asia/Yekaterinburg — имена разные
    render(
      <CabinetActiveBookings
        bookings={[booking()]}
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
      />,
    );

    await Promise.resolve();
    expect(screen.queryByText('!')).not.toBeInTheDocument();
    expect(screen.queryByText(/^UTC/)).not.toBeInTheDocument();
  });

  it('экран «Запись подтверждена» несёт то же предупреждение, а не собственную логику', async () => {
    deviceTimeZone.current = 'Europe/Moscow';
    render(
      <BookingDoneClient
        slotStart={SLOT_START}
        slotEnd={SLOT_END}
        serviceTitle="Консультация"
        locationLabel="Филиал на Ленина"
        bookingId="booking-1"
        backToHubHref="/app/patient/booking"
        appDisplayTimeZone={APP_DISPLAY_TIME_ZONE}
        branchTimeZone="Asia/Yekaterinburg"
        appBaseUrl="https://example.test"
      />,
    );

    expect(await screen.findByText('UTC+5')).toBeInTheDocument();
    expect(screen.getByText('!')).toBeInTheDocument();
  });
});
