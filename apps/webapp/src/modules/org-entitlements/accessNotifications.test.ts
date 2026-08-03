import { describe, expect, it } from 'vitest';
import {
  accessNotificationBillingVariables,
  accessNotificationVariables,
  dueAccessNotifications,
  dueLifecycleNotifications,
  renderAccessNotification,
} from './accessNotifications';
import type { AccessNotificationRule, MechanicAccessWarning } from './types';

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

  // Breakage: the warning reads a live tariff or invents a value when billing has no invoice for
  // the next period. The renewal invoice is the immutable billing fact for this organization.
  it('renders amount and autopay-period start from the organization renewal invoice only', () => {
    const warning: Pick<MechanicAccessWarning, 'periodSource' | 'periodEndsAt' | 'notifications'> = {
      periodSource: 'paid_period',
      periodEndsAt: '2026-09-01T00:00:00.000Z',
      notifications: [
        {
          offsetDays: 0,
          condition: 'payment_failed',
          template: 'Следующая оплата {{сумма}} с {{дата_начала_периода_автооплаты}}.',
        },
      ],
    };
    const variables = accessNotificationBillingVariables(warning, {
      invoices: [
        {
          invoiceKind: 'tariff_period',
          amountMinor: 490_000,
          servicePeriodStartsAt: '2026-09-01T00:00:00.000Z',
          status: 'pending',
        },
      ],
    });

    expect(
      renderAccessNotification(warning.notifications[0]!.template, variables),
    ).toBe('Следующая оплата 4 900 с 01.09.2026.');
  });

  // The same renderer must leave the owner's placeholders visible when the organization does not
  // have a renewal invoice. A live tariff price is not a substitute: an already-paid period is frozen.
  it('does not invent amount or autopay date without the matching renewal invoice', () => {
    const warning: Pick<MechanicAccessWarning, 'periodSource' | 'periodEndsAt'> = {
      periodSource: 'paid_period',
      periodEndsAt: '2026-09-01T00:00:00.000Z',
    };
    const variables = accessNotificationBillingVariables(warning, {
      invoices: [
        {
          invoiceKind: 'tariff_period',
          amountMinor: 990_000,
          servicePeriodStartsAt: '2026-10-01T00:00:00.000Z',
          status: 'pending',
        },
      ],
    });

    expect(
      renderAccessNotification('Следующая оплата {{сумма}} с {{дата_начала_периода_автооплаты}}.', variables),
    ).toBe('Следующая оплата {{сумма}} с {{дата_начала_периода_автооплаты}}.');
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

/**
 * Т2/Т7 (owner 04.08) — five conditions beyond the payment pair, each anchored on its own
 * org-lifecycle timestamp rather than a paid period's end.
 */
describe('lifecycle notification triggers (Т2/Т7)', () => {
  const anchors = {
    registeredAt: '2026-08-01T00:00:00.000Z',
    trialStartedAt: '2026-08-01T00:00:00.000Z',
    trialEndsAt: '2026-08-15T00:00:00.000Z',
    discountEndsAt: '2026-08-18T00:00:00.000Z',
  };
  const lifecycleRules: AccessNotificationRule[] = [
    { offsetDays: 0, condition: 'registration', template: 'добро пожаловать' },
    { offsetDays: 0, condition: 'trial_started', template: 'триал начался' },
    { offsetDays: 0, condition: 'trial_ended', template: 'триал закончился' },
    { offsetDays: 0, condition: 'discount_period_started', template: 'льгота началась' },
    // Т7 дословно: «уведомление о том что скидка скоро закончится» — a WARNING, so it must fire
    // BEFORE discountEndsAt, i.e. a negative offsetDays. A positive one would fire after the
    // window already closed, which is not what the owner asked for.
    { offsetDays: -1, condition: 'discount_period_ended', template: 'скидка скоро закончится' },
  ];

  // Breakage: the registration/trial-start/trial-end rows stop firing because nothing anchors
  // them (they don't share `periodEndsAt` with the payment pair).
  it('fires registration, trial-start and trial-end each on its own anchor', () => {
    const due = dueLifecycleNotifications({
      notifications: lifecycleRules,
      anchors,
      now: new Date('2026-08-16T00:00:00.000Z'),
      hasPaidSinceTrial: false,
    }).map((rule) => rule.template);
    expect(due).toEqual(
      expect.arrayContaining(['добро пожаловать', 'триал начался', 'триал закончился']),
    );
  });

  // Breakage: a lifecycle row fires before its anchor instant instead of waiting for it.
  it('does not fire a lifecycle row before its anchor is reached', () => {
    const due = dueLifecycleNotifications({
      notifications: lifecycleRules,
      anchors,
      now: new Date('2026-07-31T00:00:00.000Z'),
      hasPaidSinceTrial: false,
    });
    expect(due).toEqual([]);
  });

  // Т7 дословно: «тогда я могу слать письма с предложением о покупке со льготой и уведомление о
  // том что скидка скоро закончится, но только тем кто ещё не купил после завершения триала».
  it('fires both discount-window triggers once their anchor is due, while unpaid', () => {
    const due = dueLifecycleNotifications({
      notifications: lifecycleRules,
      anchors,
      now: new Date('2026-08-19T00:00:00.000Z'),
      hasPaidSinceTrial: false,
    }).map((rule) => rule.template);
    expect(due).toEqual(expect.arrayContaining(['льгота началась', 'скидка скоро закончится']));
  });

  // Breakage: Т7's hard rule is dropped and a clinic that already paid still gets a discount
  // upsell/expiry email.
  it('suppresses both discount-window triggers once the organization has paid', () => {
    const due = dueLifecycleNotifications({
      notifications: lifecycleRules,
      anchors,
      now: new Date('2026-08-19T00:00:00.000Z'),
      hasPaidSinceTrial: true,
    }).map((rule) => rule.condition);
    expect(due).not.toContain('discount_period_started');
    expect(due).not.toContain('discount_period_ended');
    // The registration/trial pair are unrelated to payment and still fire.
    expect(due).toEqual(
      expect.arrayContaining(['registration', 'trial_started', 'trial_ended']),
    );
  });

  // Breakage: a missing anchor (event hasn't happened yet) is treated as "due now" instead of
  // "never due" — e.g. an org with no trial at all would get a phantom "trial ended" email.
  it('never fires a condition whose anchor is absent', () => {
    const due = dueLifecycleNotifications({
      notifications: lifecycleRules,
      anchors: { registeredAt: null, trialStartedAt: null, trialEndsAt: null, discountEndsAt: null },
      now: new Date('2026-12-01T00:00:00.000Z'),
      hasPaidSinceTrial: false,
    });
    expect(due).toEqual([]);
  });
});
