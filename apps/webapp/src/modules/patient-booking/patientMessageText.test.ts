import { describe, expect, it } from 'vitest';
import {
  buildPatientCancelledMessageText,
  buildPatientCreatedMessageText,
  buildPatientPaymentCapturedMessageText,
  buildPatientRescheduledMessageText,
} from './patientMessageText';

/**
 * D14(3): эти строки обязаны побайтово совпадать с тем, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`,
 * `patientCreatedText`/`patientCancelledText`/`patientRescheduledText`/payment_captured) —
 * это перенос поведения, а не новый текст.
 */

const TZ = 'Europe/Moscow';
const SLOT_START = '2027-03-10T09:00:00.000Z'; // 12:00 MSK

describe('D14(3): вебапп воспроизводит прежние тексты интегратора', () => {
  it('created: очный приём с городом', () => {
    expect(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person', cityCodeSnapshot: 'msk' },
        TZ,
      ),
    ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОчный приём (msk)');
  });

  it('created: онлайн без города', () => {
    expect(
      buildPatientCreatedMessageText({ slotStart: SLOT_START, bookingType: 'online' }, TZ),
    ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн');
  });

  it('cancelled: без причины', () => {
    expect(buildPatientCancelledMessageText({ slotStart: SLOT_START }, TZ)).toBe(
      'Запись на 10 мар. 2027 г., 12:00 отменена.',
    );
  });

  it('cancelled: с причиной', () => {
    expect(
      buildPatientCancelledMessageText({ slotStart: SLOT_START, reason: 'заболел' }, TZ),
    ).toBe('Запись на 10 мар. 2027 г., 12:00 отменена.\nПричина: заболел');
  });

  it('rescheduled', () => {
    expect(
      buildPatientRescheduledMessageText({ slotStart: SLOT_START, bookingType: 'in_person' }, TZ),
    ).toBe('Запись перенесена на 10 мар. 2027 г., 12:00\nОчный приём');
  });

  it('payment_captured', () => {
    expect(buildPatientPaymentCapturedMessageText({ slotStart: SLOT_START }, TZ)).toBe(
      'Оплата записи подтверждена. 10 мар. 2027 г., 12:00',
    );
  });
});
