import { describe, expect, it } from 'vitest';
import {
  accessNotificationVariables,
  dueAccessNotifications,
  renderAccessNotification,
} from './accessNotifications';
import type { AccessNotificationRule } from './types';

/**
 * §5a items 2.6 / 2.6a — уведомления лестницы. Each test names the breakage it catches; the
 * subject is always "the owner's data decides", never a value chosen in code.
 */
describe('access ladder notifications', () => {
  // Breakage: a template variable stops being substituted (e.g. the placeholder pattern stops
  // accepting Cyrillic names) and the clinic receives a raw `{{тариф}}` in its warning.
  it('substitutes the variables the caller supplied, in any script', () => {
    expect(
      renderAccessNotification('Тариф {{тариф}} на {{сумма}} ₽ для {{clinic_1}}', {
        тариф: 'Базовый',
        сумма: '4 900',
        clinic_1: 'Клиника №1',
      }),
    ).toBe('Тариф Базовый на 4 900 ₽ для Клиника №1');
  });

  // Breakage: a variable the caller could not supply is silently blanked, so nobody notices the
  // text went out incomplete. It must stay visible instead.
  it('leaves an unsupplied variable visible rather than blanking it', () => {
    expect(renderAccessNotification('Сумма: {{сумма}}', { тариф: 'Базовый' })).toBe(
      'Сумма: {{сумма}}',
    );
  });

  // Breakage: adding a new variable starts requiring a code change. Nothing in the module knows
  // any variable name, so an entirely unknown one works the moment the caller supplies it.
  it('accepts a variable name the code has never heard of', () => {
    expect(
      renderAccessNotification('{{дата_начала_периода_автооплаты}}', {
        дата_начала_периода_автооплаты: '01.09.2026',
      }),
    ).toBe('01.09.2026');
    expect(accessNotificationVariables('{{тариф}} и {{сумма}}')).toEqual(['тариф', 'сумма']);
  });

  const periodEndsAt = '2026-07-29T00:00:00.000Z';
  const rules: AccessNotificationRule[] = [
    { offsetDays: -3, condition: 'payment_failed', template: 'за три дня до' },
    { offsetDays: 1, condition: 'payment_failed', template: 'через день после' },
    { offsetDays: 5, condition: 'payment_failed', template: 'через пять дней после' },
    { offsetDays: 1, condition: 'payment_succeeded', template: 'оплата прошла' },
  ];

  // Breakage: the offset stops being measured from the END of the paid period (e.g. from the
  // start of the ladder), so a "three days before" reminder fires on the wrong day.
  it('treats the offset as signed days from the end of the paid period', () => {
    expect(
      dueAccessNotifications({
        notifications: rules,
        periodEndsAt,
        now: new Date('2026-07-27T00:00:00.000Z'),
        condition: 'payment_failed',
      }).map((rule) => rule.template),
    ).toEqual(['за три дня до']);

    expect(
      dueAccessNotifications({
        notifications: rules,
        periodEndsAt,
        now: new Date('2026-07-30T12:00:00.000Z'),
        condition: 'payment_failed',
      }).map((rule) => rule.template),
    ).toEqual(['за три дня до', 'через день после']);
  });

  // Breakage: the condition stops being part of the ROW and becomes a branch in code, so a
  // "payment succeeded" text is sent to a clinic that has not paid.
  it('sends only the rows written for the actual payment outcome', () => {
    expect(
      dueAccessNotifications({
        notifications: rules,
        periodEndsAt,
        now: new Date('2026-08-10T00:00:00.000Z'),
        condition: 'payment_succeeded',
      }).map((rule) => rule.template),
    ).toEqual(['оплата прошла']);
  });

  // Breakage: a cap on the number of notifications creeps back in. The owner said there is none.
  it('carries as many rows as the owner wrote', () => {
    const many: AccessNotificationRule[] = Array.from({ length: 40 }, (_unused, index) => ({
      offsetDays: index - 20,
      condition: 'payment_failed' as const,
      template: `напоминание ${index}`,
    }));
    expect(
      dueAccessNotifications({
        notifications: many,
        periodEndsAt,
        now: new Date('2026-09-30T00:00:00.000Z'),
        condition: 'payment_failed',
      }),
    ).toHaveLength(40);
  });

  // Breakage: an empty list starts producing a fallback text invented in code.
  it('produces nothing when the owner configured no notifications', () => {
    expect(
      dueAccessNotifications({
        notifications: [],
        periodEndsAt,
        now: new Date('2026-09-30T00:00:00.000Z'),
        condition: 'payment_failed',
      }),
    ).toEqual([]);
  });
});
