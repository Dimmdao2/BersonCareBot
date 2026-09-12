import { describe, expect, it } from 'vitest';
import {
  buildPatientCancelledMessageText,
  buildPatientCreatedMessageText,
  buildPatientPaymentCapturedMessageText,
  buildPatientRescheduledMessageText,
} from './patientMessageText';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';

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
const DEFAULT_TERMS = resolvePatientTerms(undefined, undefined, undefined);
/** Организация выбрала женское слово — падеж и род обязаны прийти из резолвера, а не из шаблона. */
const TRAINING_TERMS = resolvePatientTerms(undefined, undefined, 'тренировка');

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
 * Оракул здесь — не исходник шаблона, а русский язык и набор владельца (решение 12.09.2026:
 * приём · сеанс · тренировка · сессия). «Тренировка» женского рода, поэтому определение обязано
 * согласоваться: «Очная тренировка», а не «Очный тренировка». Склейки падежа в шаблоне нет —
 * формы приходят из резолвера, и этот тест краснеет, если слово перестанет до него доезжать.
 */
describe('T-F: организация выбрала «тренировка» — шаблон говорит её словом', () => {
  it('created: очный формат согласован по роду', () => {
    expect(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person', cityCodeSnapshot: 'msk' },
        TZ,
        TRAINING_TERMS,
      ),
    ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОчная тренировка (msk)');
  });

  it('rescheduled: очный формат согласован по роду', () => {
    expect(
      buildPatientRescheduledMessageText(
        { slotStart: SLOT_START, bookingType: 'in_person' },
        TZ,
        TRAINING_TERMS,
      ),
    ).toBe('Запись перенесена на 10 мар. 2027 г., 12:00\nОчная тренировка');
  });

  it('онлайн-формат словом организации не называется — надпись «Онлайн» остаётся прежней', () => {
    expect(
      buildPatientCreatedMessageText(
        { slotStart: SLOT_START, bookingType: 'online' },
        TZ,
        TRAINING_TERMS,
      ),
    ).toBe('Запись подтверждена: 10 мар. 2027 г., 12:00\nОнлайн');
  });
});
