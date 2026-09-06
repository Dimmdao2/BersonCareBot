import { describe, expect, it } from 'vitest';
import {
  AppointmentFinancialsError,
  DEFAULT_PREPAYMENT_WAIT_MINUTES,
  assertAppointmentFinancialsMutable,
  computePaymentDeadlineAt,
  initialAppointmentStatusForSnapshot,
  isAppointmentFinancialsLocked,
  normalizePrepaymentWaitMinutes,
  resolveAppointmentFinancialSnapshot,
} from './appointmentFinancialSnapshot';
import type { PrepaymentPolicyRecord } from './types';

/**
 * PAY-APPT-01…03/07/12: поведение ОДНОГО доменного расчёта финансового снимка записи.
 *
 * Оракул — требование владельца: «снимок стоимости, условие/сумма предоплаты, дедлайн и
 * платёжный статус имеют один канонический write-path». Что ломается без этих проверок:
 * предоплата, посчитанная в рублях с плавающей точкой, отдаёт пациенту сумму, которая на
 * копейку расходится с суммой в платёжном шлюзе, и платёж вечно висит недоплаченным; а
 * снятый замок денег позволяет переписать стоимость УЖЕ оплаченной записи задним числом.
 */

const NOW = '2026-09-05T10:00:00.000Z';

function policy(over: Partial<PrepaymentPolicyRecord> = {}): PrepaymentPolicyRecord {
  return {
    id: 'p1',
    organizationId: 'org1',
    serviceId: null,
    onlineCategory: null,
    mode: 'percent',
    amountMinor: null,
    percentBps: 3000,
    currency: 'RUB',
    isActive: true,
    ...over,
  } as PrepaymentPolicyRecord;
}

function resolve(over: Partial<Parameters<typeof resolveAppointmentFinancialSnapshot>[0]> = {}) {
  return resolveAppointmentFinancialSnapshot({
    servicePriceMinor: 250_000,
    policy: null,
    paymentsGloballyEnabled: true,
    now: NOW,
    prepaymentWaitMinutes: DEFAULT_PREPAYMENT_WAIT_MINUTES,
    ...over,
  });
}

describe('resolveAppointmentFinancialSnapshot: режимы предоплаты в минорных единицах', () => {
  it('«нет предоплаты» не создаёт ни требования, ни дедлайна', () => {
    const snapshot = resolve({ prepaymentOverride: { mode: 'disabled' } });
    expect(snapshot.prepaymentRequiredMinor).toBe(0);
    expect(snapshot.paymentDeadlineAt).toBeNull();
    expect(snapshot.prepaymentPercentBps).toBeNull();
  });

  it('процент считается в базисных пунктах и округляется до целой копейки', () => {
    // 2500,00 ₽ · 33,33 % = 833,25 ₽. Ровно 83_325 копеек, без хвоста double.
    const snapshot = resolve({ prepaymentOverride: { mode: 'percent', percentBps: 3333 } });
    expect(snapshot.prepaymentRequiredMinor).toBe(83_325);
    expect(Number.isSafeInteger(snapshot.prepaymentRequiredMinor)).toBe(true);
    expect(snapshot.prepaymentPercentBps).toBe(3333);
  });

  it('процент от нечётной цены не порождает дробных копеек', () => {
    const snapshot = resolve({
      servicePriceMinor: 100_001,
      prepaymentOverride: { mode: 'percent', percentBps: 5000 },
    });
    expect(snapshot.prepaymentRequiredMinor).toBe(50_001);
  });

  it('«полная оплата» требует ровно стоимость записи', () => {
    const snapshot = resolve({ prepaymentOverride: { mode: 'full_price' } });
    expect(snapshot.prepaymentRequiredMinor).toBe(250_000);
    expect(snapshot.priceMinor).toBe(250_000);
  });

  it('требование не может превысить стоимость записи', () => {
    const snapshot = resolve({
      servicePriceMinor: 10_000,
      prepaymentOverride: { mode: 'fixed_minor', amountMinor: 99_000 },
    });
    expect(snapshot.prepaymentRequiredMinor).toBe(10_000);
  });

  it('выключенная механика оплаты снимает требование целиком', () => {
    const snapshot = resolve({
      paymentsGloballyEnabled: false,
      prepaymentOverride: { mode: 'full_price' },
    });
    expect(snapshot.prepaymentRequiredMinor).toBe(0);
    expect(snapshot.paymentDeadlineAt).toBeNull();
  });

  it('без переопределения условие берётся из политики клиники', () => {
    const snapshot = resolve({ policy: policy({ percentBps: 2000 }) });
    expect(snapshot.prepaymentMode).toBe('percent');
    expect(snapshot.prepaymentRequiredMinor).toBe(50_000);
  });

  it('неактивная политика — это отсутствие требования, а не её значения', () => {
    const snapshot = resolve({ policy: policy({ isActive: false }) });
    expect(snapshot.prepaymentMode).toBe('disabled');
    expect(snapshot.prepaymentRequiredMinor).toBe(0);
  });

  it('переопределение врача побеждает политику клиники', () => {
    const snapshot = resolve({
      policy: policy({ percentBps: 2000 }),
      prepaymentOverride: { mode: 'disabled' },
    });
    expect(snapshot.prepaymentRequiredMinor).toBe(0);
  });

  it('ручная цена побеждает прайс каталога и остаётся в снимке', () => {
    const snapshot = resolve({
      servicePriceMinor: 250_000,
      priceMinorOverride: 180_000,
      prepaymentOverride: { mode: 'full_price' },
    });
    expect(snapshot.priceMinor).toBe(180_000);
    expect(snapshot.prepaymentRequiredMinor).toBe(180_000);
  });

  it('снимок не меняется от того, что прайс каталога уехал позже', () => {
    const atCreate = resolve({ servicePriceMinor: 250_000, priceMinorOverride: 180_000 });
    // Каталог подорожал; ручной снимок пересчитывают тем же расчётом с той же ручной ценой.
    const afterCatalogChange = resolve({
      servicePriceMinor: 900_000,
      priceMinorOverride: atCreate.priceMinor,
    });
    expect(afterCatalogChange.priceMinor).toBe(180_000);
  });
});

describe('resolveAppointmentFinancialSnapshot: дробные деньги отвергаются', () => {
  it('дробная цена — ошибка, а не округление', () => {
    expect(() => resolve({ priceMinorOverride: 1000.5 })).toThrow(AppointmentFinancialsError);
  });

  it('отрицательная цена — ошибка', () => {
    expect(() => resolve({ priceMinorOverride: -1 })).toThrow(AppointmentFinancialsError);
  });

  it('процент вне диапазона 0..100 % — ошибка', () => {
    expect(() =>
      resolve({ prepaymentOverride: { mode: 'percent', percentBps: 10_001 } }),
    ).toThrow(AppointmentFinancialsError);
  });
});

describe('дедлайн оплаты', () => {
  it('считается один раз от момента создания и по настройке клиники', () => {
    const snapshot = resolve({
      prepaymentOverride: { mode: 'full_price' },
      prepaymentWaitMinutes: 45,
    });
    expect(snapshot.paymentDeadlineAt).toBe('2026-09-05T10:45:00.000Z');
  });

  it('умолчание для новой клиники — 20 минут', () => {
    expect(DEFAULT_PREPAYMENT_WAIT_MINUTES).toBe(20);
    expect(normalizePrepaymentWaitMinutes(null)).toBe(20);
    expect(computePaymentDeadlineAt(NOW, DEFAULT_PREPAYMENT_WAIT_MINUTES)).toBe(
      '2026-09-05T10:20:00.000Z',
    );
  });

  it('искусственного продуктового максимума нет: сутки ожидания допустимы', () => {
    expect(normalizePrepaymentWaitMinutes(1440)).toBe(1440);
    expect(computePaymentDeadlineAt(NOW, 1440)).toBe('2026-09-06T10:00:00.000Z');
  });

  it('ноль и дробь минут отвергаются', () => {
    expect(() => normalizePrepaymentWaitMinutes(0)).toThrow(AppointmentFinancialsError);
    expect(() => normalizePrepaymentWaitMinutes(1.5)).toThrow(AppointmentFinancialsError);
  });
});

describe('замок денег', () => {
  it('зачисленная предоплата запрещает переписывать финансы', () => {
    const state = { prepaymentPaidMinor: 50_000, paymentRef: null, status: 'awaiting_payment' };
    expect(isAppointmentFinancialsLocked(state)).toBe(true);
    expect(() => assertAppointmentFinancialsMutable(state)).toThrow(
      /appointment_financials_locked/,
    );
  });

  it('удержанный платёж запрещает переписывать финансы даже при нулевой сумме', () => {
    const state = { prepaymentPaidMinor: 0, paymentRef: 'pay-1', status: 'confirmed' };
    expect(isAppointmentFinancialsLocked(state)).toBe(true);
  });

  it('до оплаты снимок правится', () => {
    const state = { prepaymentPaidMinor: 0, paymentRef: null, status: 'awaiting_payment' };
    expect(isAppointmentFinancialsLocked(state)).toBe(false);
    expect(() => assertAppointmentFinancialsMutable(state)).not.toThrow();
  });
});

describe('начальный статус записи', () => {
  it('требование предоплаты держит слот в ожидании оплаты', () => {
    expect(
      initialAppointmentStatusForSnapshot(
        { prepaymentRequiredMinor: 50_000 },
        { coveredByPackage: false },
      ),
    ).toBe('awaiting_payment');
  });

  it('без требования запись сразу подтверждена', () => {
    expect(
      initialAppointmentStatusForSnapshot(
        { prepaymentRequiredMinor: 0 },
        { coveredByPackage: false },
      ),
    ).toBe('confirmed');
  });

  it('абонемент закрывает требование: платить нечего', () => {
    expect(
      initialAppointmentStatusForSnapshot(
        { prepaymentRequiredMinor: 50_000 },
        { coveredByPackage: true },
      ),
    ).toBe('confirmed');
  });
});
