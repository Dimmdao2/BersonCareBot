import { describe, expect, it } from 'vitest';

import {
  cabinetGraceWarningMessages,
  cabinetLifecycleWarningMessages,
} from './cabinetAccessGate';
import type { AccessNotificationRule } from '@/modules/org-entitlements/types';

const VARIABLES = { клиника: 'Ромашка', тариф: 'Базовый' };
const NOW = new Date('2026-08-16T00:00:00.000Z');

const lifecycleNotifications: AccessNotificationRule[] = [
  {
    offsetDays: 0,
    condition: 'registration',
    template: 'Добро пожаловать, {{клиника}}.',
  },
  {
    offsetDays: 0,
    condition: 'trial_started',
    template: 'Триал начался для {{клиника}}.',
  },
  {
    offsetDays: 0,
    condition: 'trial_ended',
    template: 'Триал закончился для {{клиника}}.',
  },
  {
    offsetDays: 0,
    condition: 'discount_period_started',
    template: 'Льготное окно открыто для {{клиника}}.',
  },
  {
    offsetDays: -1,
    condition: 'discount_period_ended',
    template: 'Скидка скоро закончится для {{клиника}}.',
  },
];

describe('§1069 T2/T7: lifecycle warnings in the cabinet banner', () => {
  it('shows registration text once the first cabinet entry anchor is set', () => {
    expect(
      cabinetLifecycleWarningMessages({
        notifications: lifecycleNotifications,
        anchors: {
          registeredAt: '2026-08-01T00:00:00.000Z',
          trialStartedAt: null,
          trialEndsAt: null,
          discountEndsAt: null,
        },
        hasPaidSinceTrial: false,
        variables: VARIABLES,
        now: NOW,
      }),
    ).toEqual(['Добро пожаловать, Ромашка.']);
  });

  it('shows trial-ended and discount-window texts when anchors are due', () => {
    expect(
      cabinetLifecycleWarningMessages({
        notifications: lifecycleNotifications,
        anchors: {
          registeredAt: '2026-08-01T00:00:00.000Z',
          trialStartedAt: '2026-08-01T00:00:00.000Z',
          trialEndsAt: '2026-08-15T00:00:00.000Z',
          discountEndsAt: '2026-08-18T00:00:00.000Z',
        },
        hasPaidSinceTrial: false,
        variables: VARIABLES,
        now: new Date('2026-08-17T00:00:00.000Z'),
      }),
    ).toEqual(
      expect.arrayContaining([
        'Триал закончился для Ромашка.',
        'Льготное окно открыто для Ромашка.',
        'Скидка скоро закончится для Ромашка.',
      ]),
    );
  });

  // Арбитр: убрать hasPaidSinceTrial из cabinetLifecycleWarningMessages — discount texts вернутся
  // клинике, которая уже оплатила после триала.
  it('suppresses discount-window texts after the organization paid post-trial', () => {
    const messages = cabinetLifecycleWarningMessages({
      notifications: lifecycleNotifications,
      anchors: {
        registeredAt: '2026-08-01T00:00:00.000Z',
        trialStartedAt: '2026-08-01T00:00:00.000Z',
        trialEndsAt: '2026-08-15T00:00:00.000Z',
        discountEndsAt: '2026-08-18T00:00:00.000Z',
      },
      hasPaidSinceTrial: true,
      variables: VARIABLES,
      now: NOW,
    });

    expect(messages).not.toContain('Льготное окно открыто для Ромашка.');
    expect(messages).not.toContain('Скидка скоро закончится для Ромашка.');
    expect(messages).toContain('Триал закончился для Ромашка.');
  });

  it('does not mix payment-failed grace rows into lifecycle rendering', () => {
    expect(
      cabinetGraceWarningMessages(
        {
          until: '2026-08-14',
          periodEndsAt: '2026-08-01T00:00:00.000Z',
          periodSource: 'trial',
          nextState: 'read_only',
          notifications: lifecycleNotifications,
        },
        VARIABLES,
        NOW,
      ),
    ).toEqual([]);
  });
});
