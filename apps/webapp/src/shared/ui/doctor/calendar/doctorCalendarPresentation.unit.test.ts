import { describe, expect, it } from 'vitest';
import {
  doctorCalendarAppointmentBranchColors,
  doctorCalendarAppointmentClassName,
} from './doctorCalendarPresentation';
import { DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS } from '../doctorVisual';

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
