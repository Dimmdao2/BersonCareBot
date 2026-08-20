/**
 * Blind acceptance test written by the audit of `wt/public-booking-write-20260819`, not by the
 * author of the change. It originally fixed the owner ruling of 2026-08-19
 * (`OWNER_PRODUCT_RULES.md` §33.2), verbatim: «оплаченное место не должно быть связано с записями
 * на приём вообще никак» — while «специалистов ограничивать — да, это надо».
 *
 * §33.2 kept the `patient_count` ceiling for a staff-opened card and only exempted the public
 * booking door. Т12 (`docs/OWNER_DECISIONS.md`, owner 19.08, later the same day, дословно: «лимит
 * клиентов - убрать») superseded that narrower shape: the ceiling is gone from every door, staff
 * included — a clinic is billed for seats, not for people in its base. See merge note on this file
 * for the reconciliation; `pgPatientOrganizationEnrollment.noClientCeiling.test.ts` is the dedicated
 * T12 acceptance test for the staff writer.
 *
 * Behaviours this file still fixes, one per direction §33.2/Т12 together can be broken:
 *  1. a public visitor's own booking never consults the paid `patient_count` ceiling, whatever the
 *     clinic's usage is (migration 0052 briefly put it on this path, 0053 took it off, and Т12 then
 *     removed the ceiling itself);
 *  2. a staff-opened card doesn't either any more (Т12) — asserted here too, so a future change that
 *     reintroduces the door on either path fails in both places;
 *  3. the specialist (clinic team) seat is untouched and still refuses at its own ceiling — Т12 named
 *     `patient_count` only, `clinic_team` is a different mechanic and was not ruled on.
 *
 * Plus the contact pair the public form collects, which the write half must carry to the booking
 * unchanged — it is the only place a clinic learns how to call the person back.
 *
 * The retired `patient_count` ceiling was reached through exactly one door,
 * `app.assert_org_patient_count_quota_available`. The public path is therefore driven with the real
 * `pgPublicBookingUserResolve` over a recording SQL layer, so every named root the path actually
 * invokes is observed by name — a future change that re-attaches the ceiling to this path fails
 * here instead of refusing a visitor in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PATIENT_COUNT_DOOR = 'app.assert_org_patient_count_quota_available';
const ENROL_DOOR = 'app.enroll_current_patient_in_public_booking_clinic(uuid,text)';

const recorded = vi.hoisted(() => ({ roots: [] as string[], sql: [] as string[] }));

const fakes = vi.hoisted(() => ({
  namedRoot: vi.fn(),
  runSql: vi.fn(),
  createBooking: vi.fn(),
  resolveContext: vi.fn(),
  mergeCandidates: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({}),
  runWebappNamedRoot: fakes.namedRoot,
  runWebappSql: fakes.runSql,
}));
vi.mock('@/app-layer/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientIdentityPrincipal: (_ctx: unknown, fn: () => unknown) => fn(),
  withPatientOrganizationPrincipal: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/app-layer/platform-user/recordPublicBookingMergeCandidates', () => ({
  recordPublicBookingMergeCandidates: fakes.mergeCandidates,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
  resolveCurrentPatientInPersonBookingContext: fakes.resolveContext,
}));

import { createVerifiedPublicBooking } from './createVerifiedPublicBooking';
import { ensureInvitedOrganizationClientRelationship } from '@/infra/repos/pgPatientOrganizationEnrollment';
import { decideClinicTeamQuota } from '@/infra/repos/transactionQuotaPort';

/** Drizzle renders `sql` lazily; the identity of a root is read out of the template chunks. */
function sqlText(fragment: unknown): string {
  return JSON.stringify(fragment ?? null);
}

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PLATFORM_USER_ID = '00000000-0000-4000-8000-000000000002';

const intent = {
  v: 1 as const,
  organizationId: ORGANIZATION_ID,
  branchId: 'branch-1',
  serviceId: 'service-1',
  slotStart: '2027-03-01T10:00:00.000Z',
  slotEnd: '2027-03-01T11:00:00.000Z',
  slotCount: 1,
  contactName: 'Пришедший посетитель',
  contactPhone: '+79995550101',
  contactEmail: 'visitor@example.org',
  formAnswers: undefined,
  attribution: undefined,
} as never;

beforeEach(() => {
  recorded.roots.length = 0;
  recorded.sql.length = 0;
  vi.clearAllMocks();
  fakes.namedRoot.mockImplementation(async (_db: unknown, identity: string) => {
    recorded.roots.push(identity);
    if (identity === ENROL_DOOR) {
      return { rows: [{ enrollment: { status: 'active', effect: 'created' } }] };
    }
    return { rows: [{}] };
  });
  fakes.runSql.mockImplementation(async (_db: unknown, fragment: unknown) => {
    recorded.sql.push(sqlText(fragment));
    return { rows: [] };
  });
  fakes.resolveContext.mockResolvedValue({
    organizationId: ORGANIZATION_ID,
    branchId: 'branch-1',
    serviceId: 'service-1',
    cityCode: 'MSK',
  });
  fakes.createBooking.mockImplementation(async (input: unknown) => ({
    id: 'booking-1',
    status: 'confirmed',
    canonicalAppointmentId: null,
    input,
  }));
});

const deps = {
  patientBooking: { createBooking: (input: unknown) => fakes.createBooking(input) },
} as never;

describe('a visitor booking spends no paid client place (owner 19.08 §33.2)', () => {
  it('never reaches the patient_count ceiling on the public write path', async () => {
    await createVerifiedPublicBooking(deps, intent, PLATFORM_USER_ID, 'public_booking_phone_otp');

    expect(recorded.roots).toContain(ENROL_DOOR);
    const everySqlSeen = [...recorded.roots, ...recorded.sql].join('\n');
    expect(everySqlSeen).not.toContain(PATIENT_COUNT_DOOR);
  });

  it('books the visitor even when the clinic is at its client ceiling', async () => {
    // The ceiling is a refusal raised by that one door.  If the public path ever consults it again,
    // the door below fires and the visit is lost — which is exactly what the owner ruled against.
    fakes.namedRoot.mockImplementation(async (_db: unknown, identity: string) => {
      recorded.roots.push(identity);
      if (identity.startsWith(PATIENT_COUNT_DOOR)) {
        throw Object.assign(new Error('saas_quota_reached:patient_count'), { code: '53400' });
      }
      if (identity === ENROL_DOOR) {
        return { rows: [{ enrollment: { status: 'active', effect: 'created' } }] };
      }
      return { rows: [{}] };
    });
    fakes.runSql.mockImplementation(async (_db: unknown, fragment: unknown) => {
      recorded.sql.push(sqlText(fragment));
      if (sqlText(fragment).includes(PATIENT_COUNT_DOOR)) {
        throw Object.assign(new Error('saas_quota_reached:patient_count'), { code: '53400' });
      }
      return { rows: [] };
    });

    const booking = await createVerifiedPublicBooking(
      deps,
      intent,
      PLATFORM_USER_ID,
      'public_booking_phone_otp',
    );

    expect(booking).toBeTruthy();
    expect(fakes.createBooking).toHaveBeenCalledTimes(1);
  });

  it('carries the phone and the e-mail of the form to the booking unchanged', async () => {
    await createVerifiedPublicBooking(deps, intent, PLATFORM_USER_ID, 'public_booking_phone_otp');

    expect(fakes.createBooking).toHaveBeenCalledTimes(1);
    const written = fakes.createBooking.mock.calls[0][0] as {
      contactPhone: string;
      contactEmail: string | undefined;
      contactName: string;
    };
    expect(written.contactPhone).toBe('+79995550101');
    expect(written.contactEmail).toBe('visitor@example.org');
    expect(written.contactName).toBe('Пришедший посетитель');
  });
});

describe('a staff-opened card no longer spends one either (Т12 superseded §33.2)', () => {
  function staffTx(existingStatus: string | null) {
    let found = existingStatus;
    return {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => (found ? [{ status: found }] : []) }),
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: async () => {
            found = 'invited';
          },
        }),
      }),
    } as never;
  }

  /**
   * Negative control for the detector the public-path test relies on: the SAME rendering of the
   * SAME SQL layer must never show this door by name for a genuinely new card either — Т12 removed
   * the ceiling from this writer, not just from the public path. Full behavioural coverage (no raw
   * SQL at all, at any existing enrollment count) lives in
   * `pgPatientOrganizationEnrollment.noClientCeiling.test.ts`; this is just the by-name check the
   * sibling test in this file relies on for the public path.
   */
  it('never names the retired ceiling for a genuinely new card', async () => {
    await expect(
      ensureInvitedOrganizationClientRelationship(staffTx(null), ORGANIZATION_ID, PLATFORM_USER_ID),
    ).resolves.toBe('invited');
    expect(recorded.sql.join('\n')).not.toContain(PATIENT_COUNT_DOOR);
  });

  it('does not name it for a card that already exists either', async () => {
    await expect(
      ensureInvitedOrganizationClientRelationship(staffTx('active'), ORGANIZATION_ID, PLATFORM_USER_ID),
    ).resolves.toBe('active');
    expect(recorded.sql.join('\n')).not.toContain(PATIENT_COUNT_DOOR);
  });
});

describe('the specialist seat is still limited', () => {
  const period = {
    currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
    currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
    asOf: '2026-08-19T00:00:00.000Z',
  };

  it('refuses one more specialist at the ceiling when no seat can be sold', () => {
    expect(
      decideClinicTeamQuota({
        includedSeats: 2,
        paidAdditionalSeats: 0,
        used: 2,
        additionalSeatPriceMinor: null,
        currency: null,
        ...period,
      }),
    ).toEqual({ allowed: false, code: 'seat_limit_reached' });
  });

  it('at the ceiling asks the clinic to buy a seat rather than letting one through', () => {
    const decision = decideClinicTeamQuota({
      includedSeats: 2,
      paidAdditionalSeats: 1,
      used: 3,
      additionalSeatPriceMinor: 100000,
      currency: 'RUB',
      ...period,
    });
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ code: 'seat_overage_confirmation_required', currency: 'RUB' });
  });

  it('lets a specialist through while a paid seat is still free', () => {
    expect(
      decideClinicTeamQuota({
        includedSeats: 2,
        paidAdditionalSeats: 1,
        used: 2,
        additionalSeatPriceMinor: 100000,
        currency: 'RUB',
        ...period,
      }),
    ).toEqual({ allowed: true });
  });
});
