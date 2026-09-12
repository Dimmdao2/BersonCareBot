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
 * D14(3): эти строки обязаны побайтово совпадать с тем, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`,
 * `patientCreatedText`/`patientCancelledText`/`patientRescheduledText`/payment_captured) —
 * это перенос поведения, а не новый текст.
 *
 * T-F: слово организации о событии записи приходит в шаблон аргументом. Оракул прежних строк не
 * переписан под новый текст — он остался дословным текстом интегратора и продолжает проверять
 * ДЕФОЛТ «приём». Слово в тест приходит тем же путём, что и в продукт: через `resolvePatientTerms`,
 * а не литералом. Поэтому подмена дефолта резолвера («приём» → «сеанс») красит эти строки, а не
 * проходит мимо них.
 */

const TZ = 'Europe/Moscow';
const SLOT_START = '2027-03-10T09:00:00.000Z'; // 12:00 MSK
/** Организация ничего не выбрала: резолвер обязан отдать сегодняшнее поведение. */
const DEFAULT_TERMS = resolvePatientTerms({ appointmentLabel: undefined });

describe('D14(3): вебапп воспроизводит прежние тексты интегратора', () => {
  it('created: очный приём с городом', () => {
    expect(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person', cityCodeSnapshot: 'msk' },
        TZ,
        DEFAULT_TERMS,
      ),
    ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОчный приём (msk)');
  });

  it('created: онлайн без города', () => {
    expect(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'online' },
        TZ,
        DEFAULT_TERMS,
      ),
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
      buildPatientRescheduledMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person' },
        TZ,
        DEFAULT_TERMS,
      ),
    ).toBe('Запись перенесена на 10 мар. 2027 г., 12:00\nОчный приём');
  });

  it('payment_captured', () => {
    expect(buildPatientPaymentCapturedMessageText({ slotStart: SLOT_START }, TZ)).toBe(
      'Оплата записи подтверждена. 10 мар. 2027 г., 12:00',
    );
  });
});

/**
 * T-F, переписано по методологии владельца 12.09 (см. T-G в
 * `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`): не пиннить готовую композированную
 * фразу под один зашитый label (§10a, N1 старого аудита — превзойдено), а гонять шаблон по ВСЕМ
 * четырём значениям `APPOINTMENT_LABEL_VALUES` и сверять с тем, что для этого же label уже отдаёт
 * `appointmentDeliveryFormatLabels` — общий помощник, который сам проверен отдельно (и независимо
 * от шаблона) в `patientTerms.unit.test.ts` против канонической таблицы `APPOINTMENT_TERMS_BY_LABEL`.
 *
 * Это ловит именно то, что ловили старые тесты:
 * - I2 (шаблон игнорирует `terms` и печатает литерал): если `buildPatient*MessageText` хардкодит
 *   «Очный приём», для label ≠ «приём» ожидание (построенное из РЕАЛЬНОГО `appointmentDeliveryFormatLabels`)
 *   разойдётся с константным хардкодом — тест покраснеет на 3 из 4 значений;
 * - I5 (род не согласован): если бы разошёлся род внутри шаблона отдельно от `appointmentDeliveryFormatLabels`
 *   (два места дублируют выбор формы), несовпадение тоже проявится. Правильность самого согласования
 *   рода — отдельный, более прямой тест `agreeWithAppointment` в `patientTerms.unit.test.ts`.
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
      ).toBe(`Запись подтверждена: 10 мар. 2027 г., 12:00\n${inPersonLabel} (msk)`);
    });

    it('rescheduled: очный формат приходит из резолвера', () => {
      expect(
        buildPatientRescheduledMessageText(
          { slotStart: SLOT_START, bookingType: 'in_person' },
          TZ,
          terms,
        ),
      ).toBe(`Запись перенесена на 10 мар. 2027 г., 12:00\n${inPersonLabel}`);
    });

    it('онлайн-формат словом организации не называется — надпись «Онлайн» не зависит от terms', () => {
      expect(
        buildPatientCreatedMessageText(
          { slotStart: SLOT_START, bookingType: 'online' },
          TZ,
          terms,
        ),
      ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн');
    });
  },
);
