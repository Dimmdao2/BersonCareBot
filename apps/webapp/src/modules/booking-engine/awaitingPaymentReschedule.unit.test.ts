import { describe, expect, it } from 'vitest';
import { assertValidAppointmentStatusTransition } from './appointmentStatusFsm';
import { appointmentStatusAfterReschedule } from '@/modules/payments/appointmentFinancialSnapshot';

/**
 * PAY-APPT-12: «Изменение услуги, стоимости или условия предоплаты ДО оплаты корректно обновляет
 * снимок и платёжное требование».
 *
 * Что ломается без этих проверок — два разных отказа на одном месте, оба достижимы обычным
 * действием врача над записью в ожидании оплаты:
 *
 * 1. Перенос ведёт запись через `rescheduled`. Не будь этого ребра у `awaiting_payment`, любая
 *    правка ожидающей записи (время, услуга, стоимость, само условие предоплаты) отказывает 500 —
 *    а другой двери для неё в системе нет.
 * 2. Перенос завершался жёстким `confirmed`. Для неоплаченной записи это молчаливое
 *    подтверждение: тик истечения отбирает строки по `status = 'awaiting_payment'` и такую строку
 *    больше не видит — слот навсегда держит подтверждённая, но неоплаченная запись.
 */
describe('перенос записи, ожидающей предоплаты', () => {
  it('ожидающую оплаты запись вообще можно перенести', () => {
    expect(() =>
      assertValidAppointmentStatusTransition('awaiting_payment', 'rescheduled'),
    ).not.toThrow();
    expect(() =>
      assertValidAppointmentStatusTransition('rescheduled', 'awaiting_payment'),
    ).not.toThrow();
  });

  it('перенос неоплаченной записи оставляет её в ожидании, а не подтверждает', () => {
    expect(
      appointmentStatusAfterReschedule({
        fromStatus: 'awaiting_payment',
        prepaymentRequiredMinor: 75_000,
        prepaymentPaidMinor: 0,
        paymentRef: null,
      }),
    ).toBe('awaiting_payment');
  });

  it('частичной предоплаты мало: требование не покрыто — запись остаётся в ожидании', () => {
    expect(
      appointmentStatusAfterReschedule({
        fromStatus: 'awaiting_payment',
        prepaymentRequiredMinor: 75_000,
        prepaymentPaidMinor: 74_999,
        paymentRef: null,
      }),
    ).toBe('awaiting_payment');
  });

  it('покрытое требование выводит запись из ожидания переносом', () => {
    expect(
      appointmentStatusAfterReschedule({
        fromStatus: 'awaiting_payment',
        prepaymentRequiredMinor: 75_000,
        prepaymentPaidMinor: 75_000,
        paymentRef: null,
      }),
    ).toBe('confirmed');
  });

  it('удержанный платёж выводит запись из ожидания даже при нулевой зачисленной сумме', () => {
    expect(
      appointmentStatusAfterReschedule({
        fromStatus: 'awaiting_payment',
        prepaymentRequiredMinor: 75_000,
        prepaymentPaidMinor: 0,
        paymentRef: 'pay-1',
      }),
    ).toBe('confirmed');
  });

  it('обычная запись переносом по-прежнему подтверждается', () => {
    for (const fromStatus of ['created', 'confirmed', 'paid', 'rescheduled']) {
      expect(
        appointmentStatusAfterReschedule({
          fromStatus,
          prepaymentRequiredMinor: 75_000,
          prepaymentPaidMinor: 0,
          paymentRef: null,
        }),
      ).toBe('confirmed');
    }
  });
});
