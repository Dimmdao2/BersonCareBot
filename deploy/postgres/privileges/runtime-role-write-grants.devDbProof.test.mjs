/**
 * Rollback-only proof for the production Drizzle INSERT shape used by doctor broadcasts and by
 * the clinic public-address (directory entry) writer. Candidate grants are read from the
 * generated declaration artifact, applied only inside the proof transaction, and disappear when
 * the psql connection closes. Opt-in: named DEV only.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENABLED = process.env.RUN_RUNTIME_ROLE_WRITE_GRANTS_DB === '1';
const DATABASE = process.env.RUNTIME_ROLE_WRITE_GRANTS_PROOF_DB ?? 'bcb_webapp_dev';
if (DATABASE !== 'bcb_webapp_dev') throw new Error('runtime-role write proof is restricted to bcb_webapp_dev');

const generatedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../generated/privileges.bcb_webapp_dev.sql',
);
const generated = fs.readFileSync(generatedPath, 'utf8');

const TARGET_TABLES = [
  'broadcast_audit',
  'broadcast_audit_recipients',
  'clinic_public_directory_entries',
];

function generatedRelationPrivileges(table) {
  const suffix = `ON TABLE "public"."${table}"`;
  const statements = generated.split('\n').filter((line) =>
    (line.startsWith('GRANT ') || line.startsWith('REVOKE ')) && line.includes(suffix));
  assert.ok(statements.some((line) => line.startsWith('REVOKE ALL PRIVILEGES ')),
    `generated privilege reset missing for public.${table}`);
  assert.ok(statements.some((line) =>
    line.startsWith('GRANT INSERT ') && line.endsWith('TO "app_staff";')),
  `generated INSERT grant missing for public.${table}/app_staff`);
  return statements.join('\n');
}

// Reproduce reconcile ordering, not only its final GRANT. The table-level REVOKE also removes
// column privileges, so every candidate relation is reset first and then rebuilt from generated SQL.
const candidatePrivileges = TARGET_TABLES.map(generatedRelationPrivileges).join('\n');

const BROADCAST_AUDIT_ADDITIONS = ['organization_id', 'executed_at'];
const BROADCAST_RECIPIENT_ADDITIONS = ['organization_id'];
const CLINIC_DIRECTORY_ADDITIONS = [
  'description',
  'public_contact_phone',
  'public_contact_email',
  'public_website_url',
  'locations_json',
  'logo_media_id',
  'photo_media_ids',
  'card_is_published',
];

function run(sql) {
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-q',
      '-h', '/var/run/postgresql', '-p', '5432', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

function failure(sql) {
  try {
    run(sql);
    assert.fail('SQL was expected to fail');
  } catch (error) {
    return String(error.stderr ?? error.message ?? '');
  }
}

function fixture() {
  const output = run(`
WITH actor AS (
  SELECT membership.platform_user_id, membership.organization_id, ref.opaque_ref, claim.slug
  FROM public.be_organization_members AS membership
  JOIN app_ext.variant_a_identity_refs AS ref
    ON ref.physical_user_id = membership.platform_user_id AND ref.ref_kind = 'actor'
  JOIN public.organization_slug_claims AS claim
    ON claim.organization_id = membership.organization_id AND claim.kind = 'current'
  WHERE membership.status = 'active'
  ORDER BY membership.platform_user_id, membership.organization_id
  LIMIT 1
), foreign_org AS (
  SELECT organization.id, claim.slug
  FROM public.be_organizations AS organization
  JOIN public.organization_slug_claims AS claim
    ON claim.organization_id = organization.id AND claim.kind = 'current', actor
  WHERE organization.id <> actor.organization_id
  ORDER BY organization.id, claim.slug
  LIMIT 1
), capability AS (
  SELECT capability_id, session_login
  FROM app_ext.port_context_capabilities
  WHERE context_class = 'staff' AND target_role = 'app_staff'
    AND purpose = 'relation' AND function_identity IS NULL
  ORDER BY session_login
  LIMIT 1
)
SELECT actor.platform_user_id || '|' || actor.organization_id || '|' || actor.opaque_ref || '|'
       || actor.slug || '|' || foreign_org.id || '|' || foreign_org.slug || '|'
       || capability.capability_id || '|' || capability.session_login || '|'
       || encode(app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'hex')
FROM actor, foreign_org, capability;`);
  const values = output.split('|');
  assert.equal(values.length, 9, 'invalid runtime write proof fixture');
  return {
    userId: values[0], organizationId: values[1], actorRef: values[2], organizationSlug: values[3],
    foreignOrganizationId: values[4], foreignOrganizationSlug: values[5],
    capabilityId: values[6], login: values[7], argsHash: values[8],
  };
}

function installContext(f) {
  return `SET LOCAL SESSION AUTHORIZATION ${f.login};
SELECT app.begin_port_context(
  '${f.capabilityId}'::uuid,
  ROW(1::smallint, 'staff'::app.port_context_class, 'app_staff'::name, 'relation',
      NULL::regprocedure, decode('${f.argsHash}', 'hex'), '${f.actorRef}'::uuid,
      NULL::uuid, '${f.organizationId}'::uuid, NULL::bigint, NULL::uuid)::app.port_context_claims
);`;
}

function auditInsert(f, organizationId = f.organizationId) {
  return `INSERT INTO public.broadcast_audit
    (id, organization_id, actor_id, category, audience_filter, message_title, preview_only,
     audience_size, executed_at, sent_count, error_count, channels, message_body,
     delivery_jobs_total, attach_menu_after_send, blocked_recipient_count)
  VALUES (gen_random_uuid(), '${organizationId}'::uuid, '${f.userId}'::uuid, 'news', '{}'::jsonb,
          'rollback proof', false, 1, default, 0, 0, ARRAY['email']::text[], 'proof', 1, false, 0)
  RETURNING id;`;
}

function clinicDirectoryInsert(f, organizationId = f.organizationId, slug = f.organizationSlug) {
  return `INSERT INTO public.clinic_public_directory_entries
    (organization_id, slug, display_name, is_published, published_at, description,
     public_contact_phone, public_contact_email, public_website_url, locations_json,
     logo_media_id, photo_media_ids, card_is_published, created_at, updated_at)
  VALUES ('${organizationId}'::uuid, '${slug}', 'Rollback proof', true, now(), default,
          default, default, default, default, default, default, default, default, now())
  RETURNING organization_id;`;
}

test('generated broadcast grants admit the full Drizzle inserts after table privilege reset',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${candidatePrivileges}
${installContext(f)}
WITH audit AS (${auditInsert(f).replace(/;$/u, '')})
INSERT INTO public.broadcast_audit_recipients (organization_id, audit_id, platform_user_id)
SELECT '${f.organizationId}'::uuid, id, '${f.userId}'::uuid FROM audit;
ROLLBACK;`);
  assert.equal(output.includes('permission denied for table'), false);
});

test('broadcast proof turns red for each newly required audit column', { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of BROADCAST_AUDIT_ADDITIONS) {
    const error = failure(`BEGIN;
${candidatePrivileges}
REVOKE INSERT (${column}) ON TABLE public.broadcast_audit FROM app_staff;
${installContext(f)}
${auditInsert(f)}
ROLLBACK;`);
    assert.match(error, /permission denied for table broadcast_audit/iu, column);
  }
});

test('broadcast recipient proof turns red for its newly required organization_id column',
  { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of BROADCAST_RECIPIENT_ADDITIONS) {
    const error = failure(`BEGIN;
${candidatePrivileges}
REVOKE INSERT (${column}) ON TABLE public.broadcast_audit_recipients FROM app_staff;
${installContext(f)}
WITH audit AS (${auditInsert(f).replace(/;$/u, '')})
INSERT INTO public.broadcast_audit_recipients (organization_id, audit_id, platform_user_id)
SELECT '${f.organizationId}'::uuid, id, '${f.userId}'::uuid FROM audit;
ROLLBACK;`);
    assert.match(error, /permission denied for table broadcast_audit_recipients/iu, column);
  }
});

test('INSERT privilege does not cross the broadcast tenant wall', { skip: !ENABLED }, () => {
  const f = fixture();
  const error = failure(`BEGIN;
${candidatePrivileges}
${installContext(f)}
${auditInsert(f, f.foreignOrganizationId)}
ROLLBACK;`);
  assert.match(error, /row-level security policy for table "?broadcast_audit"?/iu);
});

test('generated clinic-directory grant admits the production Drizzle insert in its clinic',
  { skip: !ENABLED }, () => {
  const f = fixture();
  const output = run(`BEGIN;
${candidatePrivileges}
DELETE FROM public.clinic_public_directory_entries
WHERE organization_id = '${f.organizationId}'::uuid;
${installContext(f)}
${clinicDirectoryInsert(f)}
ROLLBACK;`);
  assert.match(output, new RegExp(f.organizationId, 'u'));
});

test('clinic-directory proof turns red for every newly required Drizzle DEFAULT column',
  { skip: !ENABLED }, () => {
  const f = fixture();
  for (const column of CLINIC_DIRECTORY_ADDITIONS) {
    const error = failure(`BEGIN;
${candidatePrivileges}
DELETE FROM public.clinic_public_directory_entries
WHERE organization_id = '${f.organizationId}'::uuid;
REVOKE INSERT (${column}) ON TABLE public.clinic_public_directory_entries FROM app_staff;
${installContext(f)}
${clinicDirectoryInsert(f)}
ROLLBACK;`);
    assert.match(error, /permission denied for table clinic_public_directory_entries/iu, column);
  }
});

test('INSERT privilege does not cross the clinic-directory tenant wall', { skip: !ENABLED }, () => {
  const f = fixture();
  const error = failure(`BEGIN;
${candidatePrivileges}
DELETE FROM public.clinic_public_directory_entries
WHERE organization_id = '${f.foreignOrganizationId}'::uuid;
-- The production BEFORE trigger rejects the foreign row first because app_staff cannot see the
-- foreign slug claim. Disable only that competing wall inside this rollback transaction so this
-- assertion reaches and proves the relation's FORCE-RLS policy independently.
ALTER TABLE public.clinic_public_directory_entries
  DISABLE TRIGGER clinic_public_directory_current_slug_guard;
${installContext(f)}
${clinicDirectoryInsert(f, f.foreignOrganizationId, f.foreignOrganizationSlug)}
ROLLBACK;`);
  assert.match(error, /row-level security policy for table "?clinic_public_directory_entries"?/iu);
});
