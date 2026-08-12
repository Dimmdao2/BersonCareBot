import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/app-layer/db/client';
import { createPgBookingEnginePort } from '@/infra/repos/pgBookingEngine';
import { createPgBookingSchedulingPort } from '@/infra/repos/pgBookingScheduling';
import { createBookingSchedulingService } from '@/modules/booking-scheduling/service';
import type { CreateAppointmentInput } from '@/modules/booking-engine/types';

const organizationId = 'b3000000-0000-4000-8000-000000000001';
const secondOrganizationId = 'b3000000-0000-4000-8000-000000000002';
const engine = createPgBookingEnginePort();
const scheduling = createBookingSchedulingService(createPgBookingSchedulingPort());

function onlineSlot(
  startAt: string,
  chainId: string | null = null,
  chainPosition: number | null = null,
  slotOrganizationId = organizationId,
) {
  const endAt = new Date(new Date(startAt).getTime() + 60 * 60_000).toISOString();
  return {
    organizationId: slotOrganizationId,
    branchId: null,
    roomId: null,
    specialistId: null,
    serviceId: null,
    platformUserId: null,
    startAt,
    endAt,
    durationMinutes: 60,
    chainId,
    chainPosition,
    source: 'native',
    status: 'confirmed',
  } satisfies CreateAppointmentInput;
}

async function clearFixture(): Promise<void> {
  await runWithDbOrganizationPrincipal(organizationId, async () => {
    await getPool().query(
      'TRUNCATE be_appointment_history_events, be_patient_timeline_events, be_appointments',
    );
  });
}

async function appointmentAggregate(
  aggregateOrganizationId = organizationId,
): Promise<{ rows: number; backendPids: number }> {
  return runWithDbOrganizationPrincipal(aggregateOrganizationId, async () => {
    const result = await getPool().query<{ rows: string; backend_pids: string }>(
      `SELECT count(*)::text AS rows,
              count(DISTINCT b3_backend_pid)::text AS backend_pids
       FROM be_appointments
       WHERE organization_id = $1`,
      [aggregateOrganizationId],
    );
    return {
      rows: Number(result.rows[0]?.rows ?? '0'),
      backendPids: Number(result.rows[0]?.backend_pids ?? '0'),
    };
  });
}

function assertOneOverlapRejection(results: PromiseSettledResult<unknown>[]): void {
  const fulfilledCount = results.filter((result) => result.status === 'fulfilled').length;
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (fulfilledCount !== 1) {
    const reasons = rejected.map((result) =>
      result.reason instanceof Error ? result.reason.message : 'non_error_rejection',
    );
    throw new Error(`unexpected_concurrency_outcome:${fulfilledCount}:${reasons.join('|')}`);
  }
  assert.equal(rejected.length, 1);
  assert.equal(
    rejected[0]?.reason instanceof Error ? rejected[0].reason.message : '',
    'slot_overlap',
  );
}

async function withDeadlockTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('range_lock_deadlock_timeout')), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function proveLegacySplitRace(): Promise<{ rows: number; backendPids: number }> {
  const slot = onlineSlot('2032-01-01T10:00:00.000Z');
  await runWithDbOrganizationPrincipal(organizationId, async () => {
    await Promise.all([
      scheduling.assertSlotAvailable({
        organizationId,
        specialistId: null,
        roomId: null,
        slotStart: slot.startAt,
        slotEnd: slot.endAt,
        durationMinutes: slot.durationMinutes,
      }),
      scheduling.assertSlotAvailable({
        organizationId,
        specialistId: null,
        roomId: null,
        slotStart: slot.startAt,
        slotEnd: slot.endAt,
        durationMinutes: slot.durationMinutes,
      }),
    ]);
    await Promise.all([engine.createAppointment(slot), engine.createAppointment(slot)]);
  });
  const aggregate = await appointmentAggregate();
  assert.deepEqual(aggregate, { rows: 2, backendPids: 2 });
  return aggregate;
}

async function proveSameSlotSerialized(): Promise<{ rows: number; rejected: number }> {
  const slot = onlineSlot('2032-01-01T10:00:00.000Z');
  const results = await runWithDbOrganizationPrincipal(organizationId, () =>
    Promise.allSettled([
      engine.createOnlineAppointmentsIfAvailable([slot]),
      engine.createOnlineAppointmentsIfAvailable([slot]),
    ]),
  );
  assertOneOverlapRejection(results);
  const aggregate = await appointmentAggregate();
  assert.equal(aggregate.rows, 1);
  return { rows: aggregate.rows, rejected: 1 };
}

async function proveOverlappingChainsSerialized(): Promise<{ rows: number; rejected: number }> {
  const chainA = randomUUID();
  const chainB = randomUUID();
  const results = await runWithDbOrganizationPrincipal(organizationId, () =>
    Promise.allSettled([
      engine.createOnlineAppointmentsIfAvailable([
        onlineSlot('2032-01-01T10:00:00.000Z', chainA, 0),
        onlineSlot('2032-01-01T11:00:00.000Z', chainA, 1),
      ]),
      engine.createOnlineAppointmentsIfAvailable([
        onlineSlot('2032-01-01T11:00:00.000Z', chainB, 0),
        onlineSlot('2032-01-01T12:00:00.000Z', chainB, 1),
      ]),
    ]),
  );
  assertOneOverlapRejection(results);
  const aggregate = await appointmentAggregate();
  assert.equal(aggregate.rows, 2);
  return { rows: aggregate.rows, rejected: 1 };
}

async function proveDifferentStartsSerialized(): Promise<{ rows: number; rejected: number }> {
  const results = await runWithDbOrganizationPrincipal(organizationId, () =>
    Promise.allSettled([
      engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T10:15:00.000Z')]),
      engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T10:45:00.000Z')]),
    ]),
  );
  assertOneOverlapRejection(results);
  const aggregate = await appointmentAggregate();
  assert.equal(aggregate.rows, 1);
  return { rows: aggregate.rows, rejected: 1 };
}

async function proveAdjacentRangesRemainIndependent(): Promise<{ rows: number; rejected: number }> {
  const results = await runWithDbOrganizationPrincipal(organizationId, () =>
    Promise.allSettled([
      engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T10:15:00.000Z')]),
      engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T11:15:00.000Z')]),
    ]),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  const aggregate = await appointmentAggregate();
  assert.equal(aggregate.rows, 2);
  return { rows: aggregate.rows, rejected: 0 };
}

async function proveReverseStartOrderDoesNotDeadlock(): Promise<{
  rows: number;
  rejected: number;
}> {
  const results = await withDeadlockTimeout(
    runWithDbOrganizationPrincipal(organizationId, () =>
      Promise.allSettled([
        engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T14:45:00.000Z')]),
        engine.createOnlineAppointmentsIfAvailable([onlineSlot('2032-01-01T14:15:00.000Z')]),
      ]),
    ),
  );
  assertOneOverlapRejection(results);
  const aggregate = await appointmentAggregate();
  assert.equal(aggregate.rows, 1);
  return { rows: aggregate.rows, rejected: 1 };
}

async function proveSameSlotIsOrganizationScoped(): Promise<{ rows: number; rejected: number }> {
  const startAt = '2032-01-01T10:00:00.000Z';
  const results = await Promise.allSettled([
    runWithDbOrganizationPrincipal(organizationId, () =>
      engine.createOnlineAppointmentsIfAvailable([onlineSlot(startAt)]),
    ),
    runWithDbOrganizationPrincipal(secondOrganizationId, () =>
      engine.createOnlineAppointmentsIfAvailable([
        onlineSlot(startAt, null, null, secondOrganizationId),
      ]),
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  assert.deepEqual(await appointmentAggregate(organizationId), { rows: 1, backendPids: 1 });
  assert.deepEqual(await appointmentAggregate(secondOrganizationId), { rows: 1, backendPids: 1 });
  return { rows: 2, rejected: 0 };
}

try {
  const legacySplit = await proveLegacySplitRace();
  await clearFixture();
  const sameSlot = await proveSameSlotSerialized();
  await clearFixture();
  const overlappingChains = await proveOverlappingChainsSerialized();
  await clearFixture();
  const differentStarts = await proveDifferentStartsSerialized();
  await clearFixture();
  const adjacentRanges = await proveAdjacentRangesRemainIndependent();
  await clearFixture();
  const reverseStartOrder = await proveReverseStartOrderDoesNotDeadlock();
  await clearFixture();
  const organizationScoped = await proveSameSlotIsOrganizationScoped();
  console.log(
    JSON.stringify({
      status: 'PASS',
      principalInstalledByInsertTrigger: true,
      legacySplitRace: legacySplit,
      hardenedSameSlot: sameSlot,
      hardenedOverlappingChains: overlappingChains,
      hardenedDifferentStarts: differentStarts,
      hardenedAdjacentRanges: adjacentRanges,
      hardenedReverseStartOrderNoDeadlock: reverseStartOrder,
      hardenedSameSlotAcrossOrganizations: organizationScoped,
    }),
  );
} finally {
  await getPool().end();
}
