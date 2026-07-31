import { describe, expect, it } from 'vitest';
import {
  buildDoctorCancelledMessageText,
  buildDoctorCreatedMessageText,
  buildDoctorPaymentCapturedMessageText,
  buildDoctorRescheduledMessageText,
} from './doctorMessageText';

/**
 * D14(4): эти строки обязаны побайтово совпадать с тем, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`,
 * `doctorCreatedText`/`doctorCancelledText`/`doctorRescheduledText`/payment_captured) —
 * это перенос поведения, а не новый текст.
 */

const TZ = 'Europe/Moscow';
const SLOT_START = '2027-03-10T09:00:00.000Z'; // 12:00 MSK

describe('D14(4): вебапп воспроизводит прежние врачебные тексты интегратора', () => {
  it('created: с именем и телефоном', () => {
    expect(
      buildDoctorCreatedMessageText(
        { slotStart: SLOT_START, contactName: 'Иван', contactPhone: '+79990000000' },
        TZ,
      ),
    ).toBe('Новая запись: Иван, +79990000000\nДата: 10 мар. 2027 г., 12:00');
  });

  it('created: без имени и телефона — прежние заглушки интегратора', () => {
    expect(buildDoctorCreatedMessageText({ slotStart: SLOT_START }, TZ)).toBe(
      'Новая запись: Пациент, без телефона\nДата: 10 мар. 2027 г., 12:00',
    );
  });

  it('cancelled', () => {
    expect(
      buildDoctorCancelledMessageText({ slotStart: SLOT_START, contactName: 'Иван' }, TZ),
    ).toBe('Отмена записи: Иван\nДата: 10 мар. 2027 г., 12:00');
  });

  it('rescheduled', () => {
    expect(
      buildDoctorRescheduledMessageText(
        { slotStart: SLOT_START, contactName: 'Иван', contactPhone: '+79990000000' },
        TZ,
      ),
    ).toBe('Перенос записи: Иван, +79990000000\nНовая дата: 10 мар. 2027 г., 12:00');
  });

  it('payment_captured: без имени — прежняя заглушка интегратора в нижнем регистре', () => {
    expect(buildDoctorPaymentCapturedMessageText({ slotStart: SLOT_START }, TZ)).toBe(
      'Оплата записи: пациент, 10 мар. 2027 г., 12:00',
    );
  });
});
