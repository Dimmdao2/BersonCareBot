import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webappRoot = resolve(import.meta.dirname, '../../..');
const repoRoot = resolve(webappRoot, '../..');

function readRepo(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('patient invite migration contract', () => {
  const migration = readRepo('apps/webapp/db/drizzle-migrations/0220_patient_portal_invites.sql');
  const claimMigration = readRepo(
    'apps/webapp/db/drizzle-migrations/0222_patient_invite_unbound_email_claim.sql',
  );
  const schema = readRepo('apps/webapp/db/schema/patientInvites.ts');
  const bookingSchema = readRepo('apps/webapp/db/schema/bookingEngine.ts');
  const overlay = readRepo('deploy/postgres/patient-invites-rls.sql');
  const pgRepo = readRepo('apps/webapp/src/infra/repos/pgPatientInvites.ts');

  it('stores opaque hashes and indexes every hot lookup path', () => {
    expect(migration).toContain('token_hash text NOT NULL');
    expect(migration).toContain('continuation_hash text');
    expect(migration).toContain('bearer_exchanged_at timestamptz');
    expect(migration).not.toMatch(/\btoken\s+text\b/);
    expect(migration).toContain('patient_invites_token_hash_key');
    expect(migration).toContain('patient_invites_continuation_hash_key');
    expect(migration).toContain('uq_patient_invites_org_patient_pending');
    expect(migration).toContain('idx_patient_invites_org_patient_status');
    expect(migration).toContain('idx_patient_invites_status_expires');
    expect(migration).toContain(
      'revoked_by_platform_user_id uuid REFERENCES public.platform_users(id)',
    );
    expect(schema).toMatch(/uniqueIndex\(['"]patient_invites_token_hash_key['"]\)/);
    expect(schema).toMatch(/index\(['"]idx_patient_invites_org_patient_status['"]\)/);
  });

  it('keeps relationship state separate from explicit portal proof', () => {
    expect(migration).toContain('portal_activated_at timestamptz');
    expect(migration).toContain('portal_activated_via text');
    expect(migration).toContain('Deliberately no legacy backfill');
    expect(migration).not.toMatch(
      /UPDATE\s+public\.org_enrollments[\s\S]{0,300}portal_activated_at[\s\S]{0,300}WHERE[\s\S]{0,100}status\s*=\s*'active'/i,
    );
    expect(bookingSchema).toContain('portalActivatedAt: timestamp("portal_activated_at"');
  });

  it('redeems only the exact invited enrollment and records conflicts without merging', () => {
    expect(migration).toContain('enrollment.id = v_invite.enrollment_id');
    expect(migration).toContain('enrollment.organization_id = v_invite.organization_id');
    expect(migration).toContain('enrollment.platform_user_id = v_invite.patient_user_id');
    expect(migration).toContain("v_enrollment_status NOT IN ('invited', 'active')");
    expect(migration).toContain("portal_activated_via = 'patient_invite_email_otp'");
    expect(migration).toContain('INSERT INTO public.patient_merge_candidates');
    expect(migration).toContain("'invite_redeem_identity_conflict'");
    expect(migration).not.toMatch(/UPDATE\s+public\.platform_users[\s\S]*merged_into_id\s*=/i);
  });

  it('keeps patient table access closed and exposes only narrow SECURITY DEFINER functions', () => {
    expect(overlay).toContain('ALTER TABLE public.patient_invites FORCE ROW LEVEL SECURITY');
    expect(overlay).toContain('REVOKE ALL ON TABLE public.patient_invites FROM app_patient');
    expect(overlay).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*patient_invites[^;]*app_patient/i,
    );
    expect(overlay).toContain(
      'ALTER FUNCTION app.redeem_patient_invite_email(text) OWNER TO app_owner',
    );
    expect(overlay).toContain(
      'GRANT EXECUTE ON FUNCTION app.redeem_patient_invite_email(text) TO app_patient',
    );
    expect(migration.match(/SECURITY DEFINER/g)?.length).toBe(6);
    expect(migration).toContain('REVOKE ALL ON FUNCTION app.exchange_patient_invite');
    expect(migration).not.toMatch(
      /RETURNS TABLE[\s\S]{0,150}(patient_user_id|email_normalized|challenge_id)/i,
    );
  });

  it('consumes the bearer once and links a replacement only after insert', () => {
    expect(migration).toContain('AND invite.bearer_exchanged_at IS NULL');
    expect(migration).toContain("'exchanged_token'::text");
    const terminalize = pgRepo.search(/status: ['"]superseded['"],/);
    const insert = pgRepo.indexOf('.insert(patientInvites)', terminalize);
    const link = pgRepo.indexOf('supersededByInviteId: created.id', insert);
    expect(terminalize).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(terminalize);
    expect(link).toBeGreaterThan(insert);
  });

  it('uses purpose-scoped invite proof without invalidating unrelated email challenges', () => {
    const service = readRepo('apps/webapp/src/modules/patient-invites/service.ts');
    expect(migration).toContain('proof_code_hash text');
    expect(migration).toContain('proof_verified_at timestamptz');
    expect(migration).toContain('proof_started_at timestamptz');
    expect(migration).toContain("v_invite.proof_started_at > now() - interval '30 seconds'");
    expect(migration).toContain('v_invite.proof_attempts >= 5');
    expect(migration).toContain('app.context_signing_secrets');
    expect(migration).toContain('app_ext.hmac');
    expect(migration).toContain("'patient-invite-proof', 'v1', 'start'");
    expect(migration).toContain("'patient-invite-proof', 'v1', 'verify'");
    expect(migration).toContain(
      'v_authenticated_platform_user_id := app.current_patient_user_id()',
    );
    expect(service).not.toContain('startEmailChallenge');
    expect(service).not.toContain('consumeEmailChallenge');
    expect(service).not.toContain('delete_email_challenges');
  });

  it('uses the shared neutral join shell and never creates a patient-specific route tree', () => {
    const exchangeRoute = readRepo('apps/webapp/src/app/api/join/exchange/route.ts');
    const startClient = readRepo('apps/webapp/src/app/join/start/JoinStartClient.tsx');
    const service = readRepo('apps/webapp/src/modules/patient-invites/service.ts');
    expect(startClient).toContain('window.location.hash.slice(1)');
    expect(startClient).toMatch(/window\.history\.replaceState\(null, ['"]['"], ['"]\/join\/start['"]\)/);
    expect(service).toMatch(/kind: ['"]patient['"] as const/);
    expect(exchangeRoute).toContain('kind: result.kind');
    expect(exchangeRoute).toContain('redirectTo: `/join/${result.continuation}`');
    expect(exchangeRoute).not.toContain('/join/patient');
  });

  it('renders truthful terminal recovery copy and labels the masked recipient as email', () => {
    const startClient = readRepo('apps/webapp/src/app/join/start/JoinStartClient.tsx');
    const continuationClient = readRepo(
      'apps/webapp/src/app/join/[continuation]/JoinPatientClient.tsx',
    );
    for (const label of [
      'Срок приглашения истёк',
      'Приглашение отозвано',
      'Создана новая ссылка',
      'Кабинет уже подключён',
    ]) {
      expect(`${startClient}\n${continuationClient}`).toContain(label);
    }
    expect(continuationClient).toContain('Email для подтверждения');
    expect(continuationClient).toContain(
      'Этот email не соответствует приглашению. Проверьте адрес и попробуйте ещё раз.',
    );
    for (const code of [
      'expired_token',
      'revoked_token',
      'superseded_token',
      'already_linked',
      'organization_unavailable',
    ]) {
      expect(continuationClient).toContain(`case '${code}'`);
    }
    expect(migration).toContain("RETURN QUERY SELECT false, 'wrong_recipient'::text");
    expect(continuationClient).toContain('{ email, code }');
    expect(continuationClient).not.toContain('Адрес для подтверждения');
  });

  it('rate-limits public exchange and proof routes by trusted IP plus opaque artifact', () => {
    const exchangeRoute = readRepo('apps/webapp/src/app/api/join/exchange/route.ts');
    const startRoute = readRepo('apps/webapp/src/app/api/join/email/start/route.ts');
    const confirmRoute = readRepo('apps/webapp/src/app/api/join/email/confirm/route.ts');
    expect(exchangeRoute).toMatch(/checkPatientInvitePublicRateLimit\(request, ['"]exchange['"]/);
    expect(startRoute).toMatch(/checkPatientInvitePublicRateLimit\(request, ['"]email_start['"]/);
    expect(confirmRoute).toMatch(/checkPatientInvitePublicRateLimit\(request, ['"]email_confirm['"]/);
    for (const route of [exchangeRoute, startRoute, confirmRoute]) {
      expect(route).toContain('proxy_configuration');
      expect(route).toContain('rate_limited');
    }
  });

  it('derives staff and patient organization scope only from trusted server context', () => {
    const doctorRoute = readRepo(
      'apps/webapp/src/app/api/doctor/patients/[userId]/portal-invite/route.ts',
    );
    const confirmRoute = readRepo('apps/webapp/src/app/api/join/email/confirm/route.ts');
    expect(doctorRoute).toContain('requireDoctorWorkspaceApiContext');
    expect(doctorRoute).toContain('getClientIdentityForOrganization(userId, organizationId)');
    expect(doctorRoute).toContain('withDoctorWorkspacePrincipal');
    expect(doctorRoute).not.toMatch(/bodySchema[\s\S]*organizationId/);
    const verify = confirmRoute.indexOf('verifyEmailProof(');
    const lookup = confirmRoute.indexOf('lookupContinuation(', verify);
    const unboundBranch = confirmRoute.indexOf("recipientBinding === 'unbound_email_claim'", lookup);
    const claim = confirmRoute.indexOf('claimUnboundEmailProof(', unboundBranch);
    const resolveIdentity = confirmRoute.indexOf('findPublicEmailUser(', verify);
    const redeem = confirmRoute.indexOf('redeemEmailProof(', resolveIdentity);
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(verify);
    expect(unboundBranch).toBeGreaterThan(lookup);
    expect(claim).toBeGreaterThan(unboundBranch);
    expect(resolveIdentity).toBeGreaterThan(verify);
    expect(redeem).toBeGreaterThan(resolveIdentity);
    expect(confirmRoute).toContain('organizationId = claimed.organizationId');
    expect(confirmRoute).not.toContain('claimVerifiedEmail');
    expect(confirmRoute).not.toContain('register');
    expect(confirmRoute).toContain('PATIENT_ORGANIZATION_PREFERENCE_COOKIE');
    expect(confirmRoute).toContain('setSessionFromUser(user)');
  });

  it('adds a narrow unbound-email claim without changing the 0220 bound-email contract', () => {
    const migrationConstraint = claimMigration.match(
      /ADD CONSTRAINT patient_invites_recipient_binding_check CHECK \(([\s\S]*?)\n\s*\);/,
    )?.[1];
    const schemaConstraint = schema.match(
      /'patient_invites_recipient_binding_check',\s*sql`([^`]*)`/,
    )?.[1];
    expect(migrationConstraint).toBeDefined();
    expect(schemaConstraint).toBeDefined();
    expect(migrationConstraint).toContain("recipient_binding = 'bound_email'");
    expect(migrationConstraint).toContain('invited_email_normalized IS NOT NULL');
    expect(migrationConstraint).toContain("recipient_binding = 'unbound_email_claim'");
    expect(migrationConstraint).toContain('invited_email_normalized IS NULL');
    expect(migrationConstraint).not.toContain("position('@'");
    expect(schemaConstraint).not.toContain("position('@'");
    const exactConstraint =
      "recipient_binding = 'bound_email' AND invited_email_normalized IS NOT NULL OR " +
      "recipient_binding = 'unbound_email_claim' AND invited_email_normalized IS NULL";
    const normalizeConstraint = (value: string) =>
      value
        .replaceAll('${table.recipientBinding}', 'recipient_binding')
        .replaceAll('${table.invitedEmailNormalized}', 'invited_email_normalized')
        .replace(/[()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    expect(normalizeConstraint(migrationConstraint ?? '')).toBe(exactConstraint);
    expect(normalizeConstraint(schemaConstraint ?? '')).toBe(exactConstraint);
    expect(claimMigration).toContain("recipient_binding text NOT NULL DEFAULT 'bound_email'");
    expect(claimMigration).toContain("recipient_binding = 'unbound_email_claim'");
    expect(claimMigration).toContain(
      'CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email',
    );
    expect(claimMigration).toContain("'patient-invite-proof', 'v1', 'claim'");
    expect(claimMigration).toContain('patient.id = v_invite.patient_user_id');
    expect(claimMigration).toContain('email_normalized = v_email');
    expect(claimMigration).toContain("'invite_redeem_identity_conflict'");
    expect(claimMigration).toContain(
      'ON CONFLICT (organization_id, anchor_user_id, candidate_user_id)',
    );
    expect(claimMigration).not.toMatch(/merged_into_id\s*=/i);
    expect(overlay).toContain(
      'ALTER FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) OWNER TO app_owner',
    );
    expect(overlay).toContain(
      'GRANT EXECUTE ON FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) TO app_patient',
    );
    expect(overlay).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*patient_invites[^;]*app_patient/i,
    );
  });

  it('adds one exact-org command namespace for all three manual patient command kinds', () => {
    const commandSchema = readRepo('apps/webapp/db/schema/manualPatientCommands.ts');
    const bookingRepo = readRepo('apps/webapp/src/infra/repos/pgBookingEngine.ts');
    const organizationRepo = readRepo('apps/webapp/src/infra/repos/pgPatientOrganization.ts');
    expect(claimMigration).toContain('CREATE TABLE IF NOT EXISTS public.manual_patient_commands');
    expect(claimMigration).toContain('command_id uuid PRIMARY KEY');
    expect(claimMigration).toContain("'scheduled', 'walk_in', 'standalone_no_contact_card'");
    expect(claimMigration).toContain('manual_patient_commands_enrollment_fkey');
    expect(claimMigration).toContain('idx_manual_patient_commands_org_created');
    expect(commandSchema).toContain('manualPatientCommands');
    expect(overlay).toContain('ALTER TABLE public.manual_patient_commands FORCE ROW LEVEL SECURITY');
    expect(overlay).toContain('REVOKE ALL ON TABLE public.manual_patient_commands FROM app_patient');
    expect(bookingRepo).toMatch(/commandKind: ['"]scheduled['"]/);
    expect(bookingRepo).toMatch(/commandKind: ['"]walk_in['"]/);
    expect(organizationRepo).toMatch(/commandKind: ['"]standalone_no_contact_card['"]/);
  });

  it('keeps an accepted unbound claim retryable only with the same live proof', () => {
    const claimFunction = claimMigration.slice(
      claimMigration.indexOf('CREATE OR REPLACE FUNCTION app.claim_unbound_patient_invite_email'),
      claimMigration.indexOf(
        'REVOKE ALL ON FUNCTION app.claim_unbound_patient_invite_email',
      ),
    );
    const verifyFunction = claimMigration.slice(
      claimMigration.indexOf('CREATE OR REPLACE FUNCTION app.verify_patient_invite_email_proof'),
    );
    expect(claimFunction).toContain("v_invite.status = 'accepted'");
    expect(claimFunction).toContain("v_invite.accepted_via IS DISTINCT FROM 'email_otp'");
    expect(claimFunction).toContain('v_invite.proof_code_hash IS NULL');
    expect(claimFunction).toContain('v_invite.proof_expires_at <= now()');
    expect(claimFunction).toContain(
      'RETURN QUERY SELECT true, NULL::text, v_invite.organization_id, v_invite.patient_user_id',
    );
    expect(claimFunction).not.toContain('proof_code_hash = NULL');
    expect(verifyFunction).toContain("v_invite.status = 'accepted'");
    expect(verifyFunction).toContain('v_invite.proof_code_hash = p_code_hash');
    expect(verifyFunction).toContain('v_invite.proof_expires_at > now()');
    expect(claimMigration).toContain(
      'CREATE OR REPLACE FUNCTION app.lookup_patient_invite_continuation',
    );
  });

  it('wires the strict overlay into both ordinary production migration paths', () => {
    const prod = readRepo('deploy/host/deploy-prod.sh');
    const webappProd = readRepo('deploy/host/deploy-webapp-prod.sh');
    for (const [migrationCommand, overlayCommand, text] of [
      [
        'pnpm --dir apps/webapp run migrate',
        'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${PATIENT_INVITES_RLS}"',
        prod,
      ],
      [
        'pnpm --dir apps/webapp run migrate',
        'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/deploy/postgres/patient-invites-rls.sql"',
        webappProd,
      ],
    ] as const) {
      const migrate = text.indexOf(migrationCommand);
      const overlayApply = text.indexOf(overlayCommand, migrate);
      const postcheck = text.indexOf('webapp-post-migrate-schema-check.sh', overlayApply);
      expect(overlayApply).toBeGreaterThan(migrate);
      expect(postcheck).toBeGreaterThan(overlayApply);
    }
  });
});
