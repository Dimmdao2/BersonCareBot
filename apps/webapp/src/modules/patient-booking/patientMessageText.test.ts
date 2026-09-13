import { describe, expect, it } from 'vitest';
import {
  buildPatientCancelledMessageText,
  buildPatientCreatedMessageText,
  buildPatientPaymentCapturedMessageText,
  buildPatientRescheduledMessageText,
} from './patientMessageText';
import {
  APPOINTMENT_LABEL_VALUES,
  appointmentDeliveryFormatLabels,
  resolvePatientTerms,
} from '@/modules/system-settings/patientTerms';

/**
 * Проверяется состав сообщения, а не его формулировка: дата в часовом поясе клиники, формат приёма
 * словом резолвера, причина отмены, различимость событий между собой. Дословные фразы отсюда
 * вырезаны — они ломались от любой редактуры текста и чинились её перепечатыванием.
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
/** Организация ничего не выбрала: резолвер обязан отдать сегодняшнее поведение. */
const DEFAULT_TERMS = resolvePatientTerms({ appointmentLabel: undefined });
const DEFAULT_IN_PERSON = appointmentDeliveryFormatLabels(DEFAULT_TERMS).in_person;

describe('пациентские тексты событий записи', () => {
  it('created: называет дату в часовом поясе клиники, очный формат и город', () => {
    const text = buildPatientCreatedMessageText(
      { slotStart: SLOT_START, bookingType: 'in_person', cityCodeSnapshot: 'msk' },
      TZ,
      DEFAULT_TERMS,
    );

    expect(text).toContain(DATE_LABEL);
    expect(text).toContain(DEFAULT_IN_PERSON);
    expect(text).toContain('(msk)');
  });

  it('created: онлайн без города не приносит ни очного формата, ни скобок города', () => {
    const text = buildPatientCreatedMessageText(
      { slotStart: SLOT_START, bookingType: 'online' },
      TZ,
      DEFAULT_TERMS,
    );

    expect(text).toContain(DATE_LABEL);
    expect(text).toContain('Онлайн');
    expect(text).not.toContain(DEFAULT_IN_PERSON);
    expect(text).not.toContain('(');
  });

  it('cancelled: без причины строка про причину не появляется', () => {
    const text = buildPatientCancelledMessageText({ slotStart: SLOT_START }, TZ);

    expect(text).toContain(DATE_LABEL);
    expect(text).not.toContain('Причина');
  });

  it('cancelled: причина доносится дословно и отдельной строкой', () => {
    const withReason = buildPatientCancelledMessageText(
      { slotStart: SLOT_START, reason: 'заболел' },
      TZ,
    );
    const withoutReason = buildPatientCancelledMessageText({ slotStart: SLOT_START }, TZ);

    expect(withReason).toContain('заболел');
    expect(withReason.startsWith(withoutReason)).toBe(true);
    expect(withReason.split('\n')).toHaveLength(2);
  });

  it('rescheduled: называет новую дату и формат и не путается с подтверждением', () => {
    const text = buildPatientRescheduledMessageText(
      { slotStart: SLOT_START, bookingType: 'in_person' },
      TZ,
      DEFAULT_TERMS,
    );

    expect(text).toContain(DATE_LABEL);
    expect(text).toContain(DEFAULT_IN_PERSON);
    expect(text).not.toBe(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person' },
        TZ,
        DEFAULT_TERMS,
      ),
    );
  });

  it('payment_captured: называет дату оплаченной записи', () => {
    expect(buildPatientPaymentCapturedMessageText({ slotStart: SLOT_START }, TZ)).toContain(
      DATE_LABEL,
    );
  });
});

/**
 * T-F, методология владельца 12.09 (T-G в
 * `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`): шаблон гоняется по ВСЕМ четырём
 * значениям `APPOINTMENT_LABEL_VALUES` и сверяется с тем, что для того же label отдаёт
 * `appointmentDeliveryFormatLabels` — общий помощник, проверенный отдельно в
 * `patientTerms.unit.test.ts` против канонической таблицы `APPOINTMENT_TERMS_BY_LABEL`.
 *
 * Ловится I2: шаблон, который печатает зашитое «Очный приём» вместо слова организации, краснеет на
 * трёх значениях из четырёх.
 */
describe.each(APPOINTMENT_LABEL_VALUES)(
  'T-F: организация выбрала «%s» — шаблон говорит словом резолвера, не литералом',
  (appointmentLabel) => {
    const terms = resolvePatientTerms({ appointmentLabel });
    const { in_person: inPersonLabel } = appointmentDeliveryFormatLabels(terms);

    it('created: очный формат приходит из резолвера', () => {
      expect(
        buildPatientCreatedMessageText(
          { slotStart: SLOT_START, bookingType: 'in_person', cityCodeSnapshot: 'msk' },
          TZ,
          terms,
        ),
      ).toContain(inPersonLabel);
    });

    it('rescheduled: очный формат приходит из резолвера', () => {
      expect(
        buildPatientRescheduledMessageText(
          { slotStart: SLOT_START, bookingType: 'in_person' },
          TZ,
          terms,
        ),
      ).toContain(inPersonLabel);
    });

    it('онлайн-формат словом организации не называется — надпись «Онлайн» не зависит от terms', () => {
      const text = buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'online' },
        TZ,
        terms,
      );

      expect(text).toContain('Онлайн');
      expect(text).not.toContain(inPersonLabel);
    });
  },
);
