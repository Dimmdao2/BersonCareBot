import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('createPgOrganizationProvisioningPort', () => {
  it('routes public signup intent create/read through RLS definer functions', () => {
    const src = readFileSync(join(__dirname, 'pgOrganizationProvisioning.ts'), 'utf8');
    const publicSignupSrc = src.slice(
      src.indexOf('async createSpecialistSignupIntent'),
      src.indexOf('async provisionSpecialistOwner'),
    );

    expect(publicSignupSrc).toContain('app.create_specialist_signup_intent');
    expect(publicSignupSrc).toContain(
      'app.create_specialist_signup_intent($1::uuid, $2, $3, $4, $5)',
    );
    expect(publicSignupSrc).toContain(
      'app.replace_pending_specialist_signup_challenge($1::uuid, $2::text)',
    );
    expect(publicSignupSrc).not.toContain('input.userId');
    expect(publicSignupSrc).toContain('app.get_pending_specialist_signup_intent');
    expect(publicSignupSrc).toContain('app.get_specialist_signup_intent_by_challenge');
    expect(publicSignupSrc).not.toContain('.insert(specialistSignupIntents)');
    expect(publicSignupSrc).not.toContain('.from(specialistSignupIntents)');
    expect(publicSignupSrc).not.toContain('specialist_last_name');
    expect(publicSignupSrc).not.toContain('specialist_first_name');
    expect(publicSignupSrc).not.toContain('specialist_patronymic');
  });

  it('keeps signup intent as a derived label and provisioning preserves the structured platform user columns', () => {
    const publicBootstrap = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-signup-public-bootstrap-rls.sql'),
      'utf8',
    );
    const provisioning = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-owner-provisioning-rls.sql'),
      'utf8',
    );

    expect(publicBootstrap).toContain('p_specialist_full_name text');
    expect(publicBootstrap).not.toContain('specialist_last_name');
    expect(provisioning).toContain('display_name = v_intent.specialist_full_name');
    expect(provisioning).toContain('v_intent.organization_title');
    const platformUserUpdate = provisioning.slice(
      provisioning.indexOf('UPDATE public.platform_users AS u'),
      provisioning.indexOf('v_organization_id := gen_random_uuid()'),
    );
    expect(platformUserUpdate).not.toContain('last_name =');
    expect(platformUserUpdate).not.toContain('first_name =');
    expect(platformUserUpdate).not.toContain('patronymic =');
  });

  it('routes specialist owner signup provisioning through the RLS definer function', () => {
    const src = readFileSync(join(__dirname, 'pgOrganizationProvisioning.ts'), 'utf8');
    const phase1Src = src.slice(
      src.indexOf('async provisionSpecialistOwner'),
      src.indexOf('async ensureOwnBookableSpecialist'),
    );

    expect(phase1Src).toContain('runWebappTransaction');
    expect(phase1Src).toContain('SELECT * FROM app.provision_specialist_owner($1::uuid)');
    expect(phase1Src).not.toContain('userId');
    expect(phase1Src).not.toContain('.insert(beOrganizations)');
    expect(phase1Src).not.toContain('.insert(beSpecialists)');
    expect(phase1Src).not.toContain('orgEnrollments');
  });

  it('makes signup creation and owner provisioning signed identity-self capabilities', () => {
    const publicBootstrap = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-signup-public-bootstrap-rls.sql'),
      'utf8',
    );
    const provisioning = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-owner-provisioning-rls.sql'),
      'utf8',
    );
    const baseGrants = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql'),
      'utf8',
    );

    expect(publicBootstrap).toContain(
      'CREATE FUNCTION app.create_specialist_signup_intent(\n  p_challenge_id uuid',
    );
    expect(publicBootstrap).toContain('VALUES (\n    app.require_staff_security_self_user_id(),');
    expect(publicBootstrap).toContain(
      'GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) TO app_patient',
    );
    expect(publicBootstrap).not.toContain(
      'GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text)',
    );

    expect(provisioning).toContain(
      'CREATE OR REPLACE FUNCTION app.provision_specialist_owner(p_challenge_id uuid)',
    );
    expect(provisioning).toContain(
      'v_platform_user_id := app.require_staff_security_self_user_id()',
    );
    expect(provisioning).toContain(
      'WHERE i.user_id = v_platform_user_id\n    AND i.challenge_id = p_challenge_id',
    );
    expect(provisioning).not.toContain('p_platform_user_id uuid');
    expect(provisioning).toContain('specialist_signup_active_membership_exists');
    expect(provisioning.indexOf('PERFORM 1\n    FROM public.be_organization_members')).toBeLessThan(
      provisioning.indexOf('v_organization_id := gen_random_uuid()'),
    );
    expect(baseGrants).toContain(
      'app.create_specialist_signup_intent(uuid, text, text, text, text)',
    );
    expect(baseGrants).toContain('app.provision_specialist_owner(uuid)');
    expect(baseGrants).not.toContain(
      'GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid, uuid)',
    );
  });

  it('claims the intent slug as current under the global unique index during provisioning', () => {
    const provisioning = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-owner-provisioning-rls.sql'),
      'utf8',
    );
    const organizationInsert = provisioning.indexOf('INSERT INTO public.be_organizations');
    const currentClaimInsert = provisioning.indexOf('INSERT INTO public.organization_slug_claims');
    const publication = provisioning.indexOf('INSERT INTO public.clinic_public_directory_entries');

    expect(organizationInsert).toBeGreaterThan(0);
    expect(currentClaimInsert).toBeGreaterThan(organizationInsert);
    expect(publication).toBeGreaterThan(currentClaimInsert);
    expect(provisioning).toContain("lower(v_intent.organization_slug),\n        'current'");
    expect(provisioning).toContain('WHEN unique_violation THEN');
    expect(provisioning).toContain("v_unique_constraint_name = 'uq_organization_slug_claims_slug'");
    expect(provisioning).toContain("'slug_unavailable'::text");
    expect(provisioning).toContain('specialist_signup_slug_reservation_not_found');
    expect(provisioning).not.toContain('signup_intent_id');
    expect(provisioning).not.toContain("kind = 'reservation'");
  });

  it('stores signup slugs on intents without calling the retired reservation function', () => {
    const publicBootstrap = readFileSync(
      join(__dirname, '../../../../../deploy/postgres/specialist-signup-public-bootstrap-rls.sql'),
      'utf8',
    );
    const src = readFileSync(join(__dirname, 'pgOrganizationProvisioning.ts'), 'utf8');

    expect(publicBootstrap).not.toContain('reserve_specialist_signup_slug');
    expect(publicBootstrap).toContain('organization_slug,\n    specialist_full_name');
    expect(publicBootstrap).toContain(
      'SET challenge_id = p_challenge_id,\n      organization_slug = lower(p_organization_slug)',
    );
    expect(publicBootstrap).toContain('lower(p_organization_slug),');
    expect(src).toContain('value.code === "23505"');
    expect(src).toContain(
      'if (isSlugUnavailableDbError(error)) throw new Error("slug_unavailable")',
    );
  });

  it('keeps staff-context specialist backfill guarded on the current membership', () => {
    const src = readFileSync(join(__dirname, 'pgOrganizationProvisioning.ts'), 'utf8');

    // Changed because the legacy repair path is owner-only; invited doctors use their invite provisioning path.
    expect(src).toContain('beSpecialists');
    expect(src).toContain('beOrganizationMembers');
    expect(src).toContain('ensureOwnBookableSpecialist');
    expect(src).toContain('membership.role !== "owner"');
    expect(src).not.toContain('membership.role !== "owner" && membership.role !== "doctor"');
    expect(src).toContain('.for("update")');
    expect(src).toContain('isNull(beOrganizationMembers.specialistId)');
    expect(src).toContain('specialist_membership_backfill_conflict');
  });
});
