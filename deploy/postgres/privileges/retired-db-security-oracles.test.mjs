import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';

const database = declaration.databases.bcb_webapp_dev;
const functions = declaration.portContext.functions;

function declaredFunction(signature) {
  const fn = functions[signature];
  assert(fn, `missing declaration for ${signature}`);
  assert.equal(fn.security, 'DEFINER', `${signature} must remain SECURITY DEFINER`);
  assert(!fn.execute.includes('PUBLIC'), `${signature} must not grant PUBLIC EXECUTE`);
  return fn;
}

function privileges(table, role) {
  return database.tables[table]?.grants[role]?.privs ?? [];
}

test('login bootstrap remains narrow: exact roots, no direct pre-session table grants', () => {
  assert.deepEqual(
    declaredFunction('app.email_otp_public_find_user_by_email(text)').execute,
    ['app_pre_session'],
  );
  assert.equal(
    declaredFunction('app.get_preferred_auth_channel_code(uuid)').owner,
    'app_seam_identity_lookup_owner',
  );
  assert.deepEqual(privileges('public.platform_users', 'app_pre_session'), []);
  assert.deepEqual(privileges('public.user_channel_preferences', 'app_pre_session'), []);
});

test('patient reminder materialization roots stay owner-isolated and non-PUBLIC', () => {
  const materializers = Object.entries(functions).filter(
    ([signature, fn]) =>
      fn.owner === 'app_seam_reminder_materialization_owner' &&
      /reminder|occurrence|delivery/.test(`${signature} ${fn.purpose}`),
  );
  assert(materializers.length >= 4, 'materialization declaration set unexpectedly disappeared');
  for (const [signature] of materializers) declaredFunction(signature);
  assert.deepEqual(privileges('integrator.user_reminder_occurrences', 'app_patient'), []);
  assert.deepEqual(privileges('integrator.user_reminder_occurrences', 'PUBLIC'), []);
});

test('patient reminder callbacks expose exact patient/integrator roots, never PUBLIC', () => {
  for (const signature of [
    'app.patient_skip_reminder_occurrence(uuid,text,text)',
    'app.patient_snooze_reminder_occurrence(uuid,text,integer)',
    'app.patient_set_reminder_muted_until(timestamp with time zone)',
  ]) {
    const fn = declaredFunction(signature);
    assert.equal(fn.owner, 'app_seam_reminder_patient_owner');
    assert(fn.execute.includes('app_patient'));
  }
});

test('billing mutations remain behind commerce/webhook roots and bootstrap has no invoice table read', () => {
  assert.deepEqual(
    declaredFunction('app.apply_paid_saas_billing_tariff(uuid,uuid)').execute,
    ['app_staff'],
  );
  assert.deepEqual(
    declaredFunction('app.resolve_saas_billing_invoice_for_webhook(text,text)').execute,
    ['app_worker'],
  );
  assert.deepEqual(privileges('public.saas_billing_invoices', 'app_pre_session'), []);
});

test('brand revision generator keeps the direct-update guard as an owned trigger contract', () => {
  const appStaffPrivileges = privileges('public.org_brand_revisions', 'app_staff');
  assert(appStaffPrivileges.some((privilege) => privilege?.priv === 'UPDATE'));
  const guard = functions['app.guard_org_brand_revision()'];
  assert(guard, 'brand revision guard declaration is missing');
  assert.equal(guard.owner, 'app_object_owner');
  assert.equal(guard.security, 'INVOKER');
  assert.equal(guard.invocation, 'trigger');
  assert.deepEqual(guard.execute, []);
});
