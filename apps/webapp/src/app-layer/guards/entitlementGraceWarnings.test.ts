// §5a пункты 2.6a и 7.0 — предупреждение МЕХАНИКИ несёт текст владельца и только по тому условию,
// которое наступило на самом деле.
//
// Зачем отдельный файл: у двери кабинета такой тест есть (`cabinetAccessLadder.test.ts`), а у двери
// механики не было — лид проверил поломкой: подмена условия в `entitlementGraceWarningMessages` на
// безусловное `payment_failed` не роняла ни один тест из 169. То есть путь механики был не покрыт,
// и враньё «тариф не оплачен» клинике с истёкшим ТРИАЛОМ прошло бы незамеченным.

import { describe, expect, it } from 'vitest';

import { entitlementGraceWarningMessages } from './requireEntitlement';
import type { MechanicAccessWarning } from '@/modules/org-entitlements/types';

const VARIABLES = { клиника: 'Ромашка', тариф: 'Базовый' };
const NOW = new Date('2026-07-30T00:00:00.000Z');

function warningWith(periodSource: MechanicAccessWarning['periodSource']): MechanicAccessWarning {
  return {
    until: '2026-08-14',
    periodEndsAt: '2026-08-01T00:00:00.000Z',
    periodSource,
    nextState: 'read_only',
    notifications: [
      {
        offsetDays: -3,
        condition: 'payment_failed',
        template: 'Клиника {{клиника}}: тариф {{тариф}} не оплачен, доступ сузится.',
      },
    ],
  } as MechanicAccessWarning;
}

describe('§5a/7.0: условие уведомления берётся из периода, который истёк', () => {
  // Арбитр: заменить `accessNotificationConditionFor(warning.periodSource)` на константу
  // `'payment_failed'` — тест краснеет, потому что на триале появится текст про неоплату.
  it('на неоплаченном периоде показывает строку владельца про ошибку оплаты', () => {
    expect(entitlementGraceWarningMessages(warningWith('paid_period'), VARIABLES, NOW)).toEqual([
      'Клиника Ромашка: тариф Базовый не оплачен, доступ сузится.',
    ]);
  });

  // Арбитр: тот же. Клинике, которой ни разу не выставляли счёт, нельзя писать «не оплачен».
  it('на истёкшем триале не показывает строку про неоплату', () => {
    expect(entitlementGraceWarningMessages(warningWith('trial'), VARIABLES, NOW)).toEqual([]);
  });

  // Арбитр: снять фильтр условия в `dueAccessNotifications` — строка про успешную оплату
  // просочится в предупреждение о деградации.
  it('не показывает строки с чужим условием', () => {
    const warning = warningWith('paid_period');
    warning.notifications = [
      { offsetDays: -3, condition: 'payment_succeeded', template: 'Оплата прошла.' },
    ];

    expect(entitlementGraceWarningMessages(warning, VARIABLES, NOW)).toEqual([]);
  });
});
