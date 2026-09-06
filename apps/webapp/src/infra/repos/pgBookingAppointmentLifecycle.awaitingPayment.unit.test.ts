import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PAY-APPT-11/12: перенос записи, ожидающей предоплаты, НЕ подтверждает её молча.
 *
 * Что ломается без этой проверки. Перенос завершался жёстким `status: 'confirmed'`. Для записи в
 * `awaiting_payment` это значит: требование предоплаты и срок оплаты остаются, а тик истечения
 * (`WHERE status = 'awaiting_payment'`) такую строку больше не видит. Слот навсегда держит
 * подтверждённая, но неоплаченная запись — и никто об этом не узнает: ручка вернёт 200.
 *
 * Проверяется ПОВЕДЕНИЕ репозитория — какой статус он реально пишет в запись, — а не наличие
 * вызова доменной функции: подменены только транспорт к базе и соседние эффекты.
 */
const fakes = vi.hoisted(() => ({
  principalKind: 'staff' as string,
  transaction: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: fakes.principalKind }),
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
  portTypedArgsForFunctionIdentity: () => [],
}));
vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => ({ transaction: fakes.transaction }),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappSql: vi.fn(),
}));

import { createPgBookingAppointmentLifecyclePort } from './pgBookingAppointmentLifecycle';

const APPOINTMENT_ID = '55555555-5555-4555-8555-555555555555';

function appointmentRow(over: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    organizationId: 'org-1',
    branchId: null,
    roomId: null,
    specialistId: '11111111-1111-4111-8111-111111111111',
    serviceId: null,
    platformUserId: '22222222-2222-4222-8222-222222222222',
    startAt: '2026-09-10T08:00:00.000Z',
    endAt: '2026-09-10T09:00:00.000Z',
    durationMinutes: 60,
    chainId: null,
    chainPosition: null,
    source: 'staff',
    status: 'awaiting_payment',
    originalStartAt: null,
    rescheduleCount: 0,
    paymentRef: null,
    priceMinor: 250_000,
    priceCurrency: 'RUB',
    prepaymentMode: 'percent',
    prepaymentPercentBps: 3000,
    prepaymentAmountMinor: null,
    prepaymentRequiredMinor: 75_000,
    prepaymentPaidMinor: 0,
    paymentDeadlineAt: '2026-09-06T10:20:00.000Z',
    packageUsageRef: null,
    phoneNormalized: null,
    attributionJson: {},
    appointmentReminderAllowedPresetIds: [],
    appointmentReminderPresetId: null,
    appointmentReminderSelectionSource: 'specialist_default',
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

/**
 * Транзакция-двойник: отдаёт заранее заданную строку на оба чтения и запоминает КАЖДЫЙ
 * записанный набор полей и КАЖДУЮ вставленную строку журналов.
 */
function runTransactionOver(row: Record<string, unknown>) {
  const sets: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const reread = () => ({ ...row, ...Object.assign({}, ...sets) });
  fakes.transaction.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) => {
    const selectChain = {
      from: () => ({
        where: () => ({
          for: async () => [row],
          limit: async () => [reread()],
        }),
      }),
    };
    const tx = {
      select: () => selectChain,
      update: () => ({
        set: (values: Record<string, unknown>) => {
          sets.push(values);
          return { where: async () => undefined };
        },
      }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          inserted.push(values);
        },
      }),
    };
    return body(tx);
  });
  return { sets, inserted };
}

const RESCHEDULE_INPUT = {
  appointmentId: APPOINTMENT_ID,
  organizationId: 'org-1',
  actorType: 'specialist' as const,
  actorId: 'user-doc-1',
  newStartAt: '2026-09-11T08:00:00.000Z',
  newEndAt: '2026-09-11T09:00:00.000Z',
  durationMinutes: 60,
  policy: { id: 'default' },
  cancellationPolicy: { id: 'default' },
  manualOverride: true,
};

describe('applyReschedule и запись в ожидании предоплаты', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.principalKind = 'staff';
  });

  it('неоплаченная запись после переноса остаётся в ожидании оплаты', async () => {
    const { sets, inserted } = runTransactionOver(appointmentRow());

    const result = await createPgBookingAppointmentLifecyclePort().applyReschedule(
      RESCHEDULE_INPUT as never,
    );

    // Первая запись — служебный проход через `rescheduled`, вторая — итоговое состояние.
    expect(sets[0]?.status).toBe('rescheduled');
    expect(sets[1]?.status).toBe('awaiting_payment');
    expect(result.status).toBe('awaiting_payment');
    // Требование и срок оплаты перенос не трогает: денег он не двигает.
    expect(result.prepaymentRequiredMinor).toBe(75_000);
    expect(result.paymentDeadlineAt).toBe('2026-09-06T10:20:00.000Z');
    // История события обязана называть настоящий итог, иначе лента пациента врёт про подтверждение.
    const history = inserted.find((row) => row.eventType === 'rescheduled');
    expect((history?.payload as { toStatus: string }).toStatus).toBe('awaiting_payment');
  });

  it('оплаченная предоплатой запись переносом подтверждается, как и раньше', async () => {
    const { sets } = runTransactionOver(
      appointmentRow({ status: 'awaiting_payment', prepaymentPaidMinor: 75_000 }),
    );

    const result = await createPgBookingAppointmentLifecyclePort().applyReschedule(
      RESCHEDULE_INPUT as never,
    );

    expect(sets[1]?.status).toBe('confirmed');
    expect(result.status).toBe('confirmed');
  });

  it('запись без требования предоплаты переносом подтверждается', async () => {
    const { sets } = runTransactionOver(
      appointmentRow({ status: 'confirmed', prepaymentMode: 'disabled', prepaymentRequiredMinor: 0 }),
    );

    await createPgBookingAppointmentLifecyclePort().applyReschedule(RESCHEDULE_INPUT as never);

    expect(sets[1]?.status).toBe('confirmed');
  });
});
