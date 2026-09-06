import { describe, expect, it } from 'vitest';
import {
  doctorAppointmentStatusView,
  doctorCalendarAppointmentBranchColors,
  doctorCalendarAppointmentClassName,
  doctorCalendarAppointmentDisplay,
} from './doctorCalendarPresentation';
import { DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS } from '../doctorVisual';
import { appointmentStatusLabel } from '@/modules/booking-calendar/appointmentStatusLabels';

const BRANCH_COLOR = '#2f6fed';

/**
 * PAY-APPT-14/17: «ожидает оплаты» must not repaint the event — it keeps whatever surface the
 * branch gave it and only adds the ONE shared status treatment. The regression this guards against
 * is the previous behaviour: both calendar views replaced the branch colour with a local amber
 * tint, so the same appointment read as a different branch depending on its payment state.
 */
describe('doctor calendar appointment appearance', () => {
  it('keeps the branch colour for an appointment awaiting payment and adds the shared status role', () => {
    const pending = { status: 'awaiting_payment', branchColor: BRANCH_COLOR };
    const settled = { status: 'confirmed', branchColor: BRANCH_COLOR };

    expect(doctorCalendarAppointmentBranchColors(pending).backgroundColor).toBe(
      doctorCalendarAppointmentBranchColors(settled).backgroundColor,
    );
    expect(doctorCalendarAppointmentBranchColors(pending).backgroundColor).toContain('rgba(');

    const pendingClass = doctorCalendarAppointmentClassName(pending);
    expect(pendingClass).toContain(DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS);
    expect(pendingClass).not.toMatch(/amber/);
    // The status class is the ONLY difference from a settled appointment of the same branch.
    expect(pendingClass.replace(DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS, '').trim()).toBe(
      doctorCalendarAppointmentClassName(settled),
    );
  });

  /**
   * The status border is authored in unlayered `doctor.css`, and an `!important` declaration there
   * ranks BELOW an `!important` Tailwind utility in `@layer utilities`. So a pending event must not
   * ALSO carry a border utility or an inline branch border — otherwise the violet border silently
   * loses the cascade and the requirement looks implemented while rendering the old colour.
   */
  it('leaves nothing competing for the border of a pending event', () => {
    for (const pending of [
      { status: 'awaiting_payment', branchColor: BRANCH_COLOR },
      { status: 'awaiting_payment', packageTitle: 'Абонемент 10' },
      { status: 'awaiting_payment' },
    ]) {
      expect(doctorCalendarAppointmentClassName(pending)).not.toMatch(/!border-/);
      expect(doctorCalendarAppointmentBranchColors(pending).borderColor).toBeUndefined();
    }
  });

  it('derives pending from the feed flag as well as the status, and never from a local shade', () => {
    const flagged = { status: 'confirmed', prepaymentPending: true, branchColor: BRANCH_COLOR };

    expect(doctorCalendarAppointmentClassName(flagged)).toContain(
      DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS,
    );
    expect(doctorCalendarAppointmentBranchColors(flagged).backgroundColor).toBe(
      doctorCalendarAppointmentBranchColors({ status: 'confirmed', branchColor: BRANCH_COLOR })
        .backgroundColor,
    );
  });

  it('lets cancellation win over payment pending: a cancelled row is destructive, not violet', () => {
    const cancelledPending = {
      status: 'cancelled_by_patient',
      prepaymentPending: true,
      branchColor: BRANCH_COLOR,
    };

    const className = doctorCalendarAppointmentClassName(cancelledPending);
    expect(className).toContain('destructive');
    expect(className).not.toContain(DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS);
    // A cancelled appointment carries its own surface, so the branch tint stays off.
    expect(doctorCalendarAppointmentBranchColors(cancelledPending)).toEqual({});
  });
});

/**
 * MONEY-13 / PAY-APPT-17. Отказ, который здесь ловится: платёж ЮKassa завис в `pending`, статус
 * записи остался `confirmed` — сетка и список пишут «Ожидает оплаты», а панель деталей читает
 * только `status` и показывает зелёную «Подтверждена». Врач по деталям записи считает деньги
 * полученными. Отказ молчаливый: ни ошибки, ни пустого экрана, расходятся только две поверхности.
 */
describe('doctor appointment status view', () => {
  it('names a confirmed appointment with a hung payment as awaiting payment, in the shared role', () => {
    const hungPayment = doctorAppointmentStatusView({
      status: 'confirmed',
      prepaymentPending: true,
    });

    expect(hungPayment.role).toBe('payment-pending');
    expect(hungPayment.label).toBe(appointmentStatusLabel('awaiting_payment'));
    expect(hungPayment.label).not.toBe(appointmentStatusLabel('confirmed'));
    expect(hungPayment.notable).toBe(true);
  });

  it('lets cancellation win over a pending payment instead of stacking two statuses', () => {
    expect(
      doctorAppointmentStatusView({ status: 'cancelled_by_patient', prepaymentPending: true }),
    ).toEqual({
      label: appointmentStatusLabel('cancelled_by_patient'),
      role: 'cancelled',
      notable: true,
    });
  });

  it('keeps ordinary statuses out of the list while still naming them for the detail panel', () => {
    // «Создана»/«Подтверждена» не дублируют саму строку списка (`notable: false`), но панель
    // деталей всё равно обязана получить их подпись — иначе статус записи там просто исчезнет.
    for (const status of ['created', 'confirmed', 'paid']) {
      const view = doctorAppointmentStatusView({ status });
      expect(view).toEqual({ label: appointmentStatusLabel(status), role: null, notable: false });
    }
    expect(doctorAppointmentStatusView({ status: 'rescheduled' })).toEqual({
      label: appointmentStatusLabel('rescheduled'),
      role: null,
      notable: true,
    });
  });
});

/**
 * PAY-APPT-14. Отказ: в месячной сетке запись отдаётся FullCalendar в режиме `auto`, тот рисует
 * её как `.fc-daygrid-dot-event` — `border-style: none` и без поверхности. Общий payment-pending
 * border и цвет филиала исчезают, хотя класс на элементе остался: ожидающая оплату запись в месяце
 * неотличима от оплаченной. Замерено живым рендером FullCalendar 6.1.21.
 */
describe('doctor calendar event display mode', () => {
  it('asks dayGrid views for a real box and leaves timeGrid on the default', () => {
    expect(doctorCalendarAppointmentDisplay('dayGridMonth')).toBe('block');
    expect(doctorCalendarAppointmentDisplay('dayGridWeek')).toBe('block');
    expect(doctorCalendarAppointmentDisplay('timeGridWeek')).toBe('auto');
    expect(doctorCalendarAppointmentDisplay('timeGridDay')).toBe('auto');
  });
});
