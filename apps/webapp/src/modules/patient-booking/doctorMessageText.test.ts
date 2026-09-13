import { describe, expect, it } from 'vitest';
import {
  buildDoctorCancelledMessageText,
  buildDoctorCreatedMessageText,
  buildDoctorPaymentCapturedMessageText,
  buildDoctorRescheduledMessageText,
} from './doctorMessageText';

/**
 * Проверяется состав врачебного сообщения, а не его формулировка: дата в часовом поясе клиники,
 * имя и телефон пациента, заглушки вместо них, различимость событий между собой. Дословные фразы
 * отсюда вырезаны — они ломались от любой редактуры текста и чинились её перепечатыванием.
 *
 * Оракул даты независим от модуля: тот же `Intl`, вызванный здесь напрямую.
 */

const TZ = 'Europe/Moscow';
const SLOT_START = '2027-03-10T09:00:00.000Z'; // 12:00 MSK
const DATE_LABEL = new Date(SLOT_START).toLocaleString('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TZ,
});

describe('врачебные тексты событий записи', () => {
  it('created: несёт дату, имя и телефон пациента', () => {
    const text = buildDoctorCreatedMessageText(
      { slotStart: SLOT_START, contactName: 'Иван', contactPhone: '+79990000000' },
      TZ,
    );

    expect(text).toContain(DATE_LABEL);
    expect(text).toContain('Иван');
    expect(text).toContain('+79990000000');
  });

  it('created: без имени и телефона врач получает заглушки, а не пустые места', () => {
    const text = buildDoctorCreatedMessageText({ slotStart: SLOT_START }, TZ);
    const named = buildDoctorCreatedMessageText(
      { slotStart: SLOT_START, contactName: 'Иван', contactPhone: '+79990000000' },
      TZ,
    );

    expect(text).toContain(DATE_LABEL);
    expect(text).not.toMatch(/:\s*,|,\s*$|\n\s*$/u);
    expect(text).not.toBe(named);
  });

  it('cancelled: отличим от создания и переноса и несёт дату с именем', () => {
    const cancelled = buildDoctorCancelledMessageText(
      { slotStart: SLOT_START, contactName: 'Иван' },
      TZ,
    );

    expect(cancelled).toContain(DATE_LABEL);
    expect(cancelled).toContain('Иван');
    expect(cancelled).not.toBe(buildDoctorCreatedMessageText({ slotStart: SLOT_START }, TZ));
  });

  it('rescheduled: несёт новую дату, имя и телефон и отличим от отмены', () => {
    const rescheduled = buildDoctorRescheduledMessageText(
      { slotStart: SLOT_START, contactName: 'Иван', contactPhone: '+79990000000' },
      TZ,
    );

    expect(rescheduled).toContain(DATE_LABEL);
    expect(rescheduled).toContain('Иван');
    expect(rescheduled).toContain('+79990000000');
    expect(rescheduled).not.toBe(
      buildDoctorCancelledMessageText({ slotStart: SLOT_START, contactName: 'Иван' }, TZ),
    );
  });

  it('payment_captured: без имени подставляется заглушка, дата на месте', () => {
    const text = buildDoctorPaymentCapturedMessageText({ slotStart: SLOT_START }, TZ);

    expect(text).toContain(DATE_LABEL);
    expect(text).not.toMatch(/:\s*,/u);
    expect(text).not.toBe(
      buildDoctorPaymentCapturedMessageText({ slotStart: SLOT_START, contactName: 'Иван' }, TZ),
    );
  });
});
