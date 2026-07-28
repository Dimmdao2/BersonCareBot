import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLINIC_SEAT_USAGE_SQL } from '@/infra/repos/seatUsageSql';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoSource = readFileSync(join(__dirname, 'pgOrganizationInvites.ts'), 'utf8');
const orgEntitlementsSource = readFileSync(join(__dirname, 'pgOrgEntitlements.ts'), 'utf8');
const overlaySource = readFileSync(
  join(__dirname, '../../../../../deploy/postgres/organization-member-invites-rls.sql'),
  'utf8',
);
const platformRuntimeSource = readFileSync(
  join(__dirname, '../../../../../deploy/postgres/c5a-platform-operations-runtime.sql'),
  'utf8',
);
const seatNonnegativeMigrationSource = readFileSync(
  join(__dirname, '../../../db/drizzle-migrations/0213_clinic_team_seat_nonnegative.sql'),
  'utf8',
);
const saasEntitlementsSchemaSource = readFileSync(
  join(__dirname, '../../../db/schema/saasEntitlements.ts'),
  'utf8',
);

describe('organization invite PostgreSQL contract', () => {
  it('replaces only a pending same-org email invite inside a transaction', () => {
    const createSource = repoSource.slice(
      repoSource.indexOf('async createReplacingPending'),
      repoSource.indexOf('async listPendingByOrganization'),
    );

    expect(createSource).toContain('runWebappTransaction');
    expect(createSource).toContain("status = 'revoked'");
    expect(createSource).toContain('organization_id = $1');
    expect(createSource).toContain('invited_email = $2');
    expect(createSource).toContain("status = 'pending'");
    expect(createSource).toContain("m.status = 'active'");
  });

  it('locks the whole organization (not organization+email) so different-email invites serialize', () => {
    const createSource = repoSource.slice(
      repoSource.indexOf('async createReplacingPending'),
      repoSource.indexOf('async listPendingByOrganization'),
    );

    expect(createSource).toContain(
      "pg_advisory_xact_lock(hashtextextended('clinic_invite_seats:' || $1::text, 0))",
    );
    // Only organizationId is bound to the org-wide lock call — email must not be part of the lock key.
    const lockCallStart = createSource.indexOf('pg_advisory_xact_lock');
    const lockCallParamsStart = createSource.indexOf('[input.organizationId]', lockCallStart);
    expect(lockCallParamsStart).toBeGreaterThan(-1);
    expect(lockCallParamsStart).toBeLessThan(createSource.indexOf('activeMember'));
  });

  it("atomically re-checks clinic_team entitlement and seat capacity for a doctor invite, excluding its own email's prior reservation", () => {
    const createSource = repoSource.slice(
      repoSource.indexOf('async createReplacingPending'),
      repoSource.indexOf('async listPendingByOrganization'),
    );

    expect(createSource).toContain('if (input.invitedRole === "doctor")');
    expect(createSource).toContain('saas_org_entitlement_overrides');
    expect(createSource).toContain('saas_tariffs');
    expect(createSource).toContain('CLINIC_SEAT_USAGE_SQL');
    expect(CLINIC_SEAT_USAGE_SQL).toContain('m.specialist_id IS NOT NULL');
    expect(CLINIC_SEAT_USAGE_SQL).toContain(
      "i.invited_role = 'doctor' AND ($2::text IS NULL OR i.invited_email <> $2)",
    );
    expect(CLINIC_SEAT_USAGE_SQL).toContain("i.status = 'accepted' AND i.invited_role = 'doctor'");
    expect(CLINIC_SEAT_USAGE_SQL).toContain("m.status = 'active' AND m.specialist_id IS NULL");
    expect(createSource).toContain('code: "seat_limit_reached"');
    // The capacity check must run before the revoke+insert, not after.
    expect(createSource.indexOf('usedValue >= limitValue')).toBeLessThan(
      createSource.indexOf("status = 'revoked'"),
    );
  });

  it('keeps storefront seat usage aligned behind a count-only DB capability', () => {
    expect(repoSource).toContain(
      'import { CLINIC_SEAT_USAGE_SQL } from "@/infra/repos/seatUsageSql"',
    );
    expect(orgEntitlementsSource).toContain('app.read_org_enforced_quota_usage($1::uuid)');
    expect(orgEntitlementsSource).not.toContain('organization_member_invites');
    expect(platformRuntimeSource).toContain('membership.specialist_id IS NOT NULL');
    expect(platformRuntimeSource).toContain("invite.status = 'pending'");
    expect(platformRuntimeSource).toContain('invite.expires_at > now()');
    expect(platformRuntimeSource).toContain("invite.invited_role = 'doctor'");
    expect(platformRuntimeSource).toContain("invite.status = 'accepted'");
    expect(platformRuntimeSource).toContain('membership.specialist_id IS NULL');
    expect(platformRuntimeSource).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE\n    public.courses,\n    public.organization_member_invites',
    );
  });

  it('keeps accept single-use and creates only the membership in its pre-session transaction', () => {
    const acceptStart = overlaySource.indexOf('CREATE OR REPLACE FUNCTION app.accept_org_invite');
    const acceptEnd = overlaySource.indexOf(
      'COMMENT ON FUNCTION app.accept_org_invite',
      acceptStart,
    );
    const acceptSource = overlaySource.slice(acceptStart, acceptEnd);

    expect(acceptSource).toContain('FOR UPDATE');
    expect(acceptSource).toContain("IF v_invite.status <> 'pending'");
    expect(acceptSource).toContain('ON CONFLICT (organization_id, platform_user_id)');
    expect(acceptSource).toContain("SET status = 'accepted'");
    expect(acceptSource).toContain('v_specialist_id := NULL');
    expect(acceptSource).not.toContain('INSERT INTO public.be_specialists');
  });

  it('atomically re-checks current clinic_team entitlement for EVERY invited role, leaving the invite pending on denial', () => {
    const acceptStart = overlaySource.indexOf('CREATE OR REPLACE FUNCTION app.accept_org_invite');
    const acceptEnd = overlaySource.indexOf(
      'COMMENT ON FUNCTION app.accept_org_invite',
      acceptStart,
    );
    const acceptSource = overlaySource.slice(acceptStart, acceptEnd);

    const orgLockIndex = acceptSource.indexOf('pg_advisory_xact_lock');
    const inviteRowLockIndex = acceptSource.indexOf('\n  FOR UPDATE;');
    expect(orgLockIndex).toBeGreaterThan(-1);
    expect(orgLockIndex).toBeLessThan(inviteRowLockIndex);
    expect(acceptSource).toContain("'clinic_invite_seats:' || v_invite_organization_id::text");
    expect(acceptSource).toContain('saas_org_entitlement_overrides');
    expect(acceptSource).toContain('saas_tariffs');
    expect(acceptSource).toContain("'entitlement_disabled'");

    // The entitlement check is NOT scoped inside `IF v_invite.invited_role = 'doctor'` — it must
    // run, and be able to deny, for every invited role (admin included) before any mutation.
    const entitlementCheckIndex = acceptSource.indexOf('IF NOT v_clinic_team_enabled THEN');
    const doctorOnlyBlockIndex = acceptSource.indexOf("IF v_invite.invited_role = 'doctor' THEN");
    expect(entitlementCheckIndex).toBeGreaterThan(-1);
    expect(doctorOnlyBlockIndex).toBeGreaterThan(-1);
    expect(entitlementCheckIndex).toBeLessThan(doctorOnlyBlockIndex);
    expect(entitlementCheckIndex).toBeLessThan(
      acceptSource.indexOf('INSERT INTO public.be_organization_members'),
    );
    expect(entitlementCheckIndex).toBeLessThan(acceptSource.indexOf("SET status = 'accepted'"));
  });

  it('atomically re-checks seat capacity before activating a doctor invite, doctor-role only, leaving it pending on denial', () => {
    const acceptStart = overlaySource.indexOf('CREATE OR REPLACE FUNCTION app.accept_org_invite');
    const acceptEnd = overlaySource.indexOf(
      'COMMENT ON FUNCTION app.accept_org_invite',
      acceptStart,
    );
    const acceptSource = overlaySource.slice(acceptStart, acceptEnd);
    const doctorBlockStart = acceptSource.indexOf("IF v_invite.invited_role = 'doctor' THEN");
    const doctorBlock = acceptSource.slice(doctorBlockStart);

    expect(doctorBlockStart).toBeGreaterThan(-1);
    expect(doctorBlock).toContain('m.specialist_id IS NOT NULL');
    expect(doctorBlock).toContain("i.invited_role = 'doctor' AND i.id <> v_invite.id");
    expect(doctorBlock).toContain("i.status = 'accepted'");
    expect(doctorBlock).toContain("m.status = 'active' AND m.specialist_id IS NULL");
    expect(doctorBlock).toContain("'seat_limit_reached'");
    // The capacity check must run, and deny, before any membership/invite mutation.
    const capacityCheckIndex = doctorBlock.indexOf('IF v_seat_used >= v_seat_limit THEN');
    expect(capacityCheckIndex).toBeGreaterThan(-1);
    expect(capacityCheckIndex).toBeLessThan(
      doctorBlock.indexOf('INSERT INTO public.be_organization_members'),
    );
    expect(capacityCheckIndex).toBeLessThan(doctorBlock.indexOf("SET status = 'accepted'"));
  });

  it('counts accepted doctor invites as reservations until specialist provisioning replaces the reservation', () => {
    const reservationStart = repoSource.indexOf('async countSeatReservationsByOrganization');
    const reservationEnd = repoSource.indexOf('async getByTokenHash', reservationStart);
    const reservationSource = repoSource.slice(reservationStart, reservationEnd);

    expect(reservationSource).toContain("i.status = 'pending'");
    expect(reservationSource).toContain("i.status = 'accepted'");
    expect(reservationSource).toContain("m.status = 'active'");
    expect(reservationSource).toContain('m.specialist_id IS NULL');
  });

  it("grants accept_org_invite's SECURITY DEFINER owner read access to the tariff/override tables it now reads", () => {
    expect(overlaySource).toContain('GRANT SELECT ON TABLE public.saas_tariffs TO app_owner;');
    expect(overlaySource).toContain(
      'GRANT SELECT ON TABLE public.saas_org_entitlement_overrides TO app_owner;',
    );
  });
});

describe('C4A seat count nonnegative contract', () => {
  it('adds an additive, idempotent nonnegative CHECK constraint for both seat columns', () => {
    expect(seatNonnegativeMigrationSource).toContain(
      'CHECK (included_seats IS NULL OR included_seats >= 0)',
    );
    expect(seatNonnegativeMigrationSource).toContain(
      'CHECK (seat_limit_override IS NULL OR seat_limit_override >= 0)',
    );
    expect(seatNonnegativeMigrationSource).toContain('DROP CONSTRAINT IF EXISTS');
    expect(seatNonnegativeMigrationSource).not.toMatch(/^\s*DROP TABLE/m);
  });

  it('mirrors the nonnegative CHECK constraints in the canonical Drizzle schema', () => {
    expect(saasEntitlementsSchemaSource).toContain('saas_tariffs_included_seats_nonnegative_check');
    expect(saasEntitlementsSchemaSource).toContain(
      'saas_org_entitlement_overrides_seat_limit_nonnegative_check',
    );
    expect(saasEntitlementsSchemaSource).toMatch(/includedSeats.*IS NULL OR.*includedSeats.*>= 0/s);
    expect(saasEntitlementsSchemaSource).toMatch(
      /seatLimitOverride.*IS NULL OR.*seatLimitOverride.*>= 0/s,
    );
  });
});
