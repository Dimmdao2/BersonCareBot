import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import { REV10_CLINICAL_ACCESS } from './relation-access.ts';

function directGrants(relation) {
  const access = REV10_CLINICAL_ACCESS[relation];
  assert.ok(access, `missing relation access: ${relation}`);
  assert.equal(access.kind, 'direct', relation);
  return access.grants;
}

function grantFor(relation, role, operation) {
  const matches = directGrants(relation).filter(
    (grant) => grant.role === role && grant.operations.includes(operation),
  );
  assert.equal(matches.length, 1, `${relation} ${role} ${operation}`);
  return matches[0];
}

function exactColumns(relation, role, operation, expected) {
  const grant = grantFor(relation, role, operation);
  assert.notEqual(grant.columns, 'table', `${relation} ${role} ${operation} must be column-scoped`);
  assert.deepEqual([...grant.columns].sort(), [...expected].sort());
}

function assertNoOperation(relation, role, operation) {
  assert.equal(
    directGrants(relation).some(
      (grant) => grant.role === role && grant.operations.includes(operation),
    ),
    false,
    `${relation} must not grant ${operation} to ${role}`,
  );
}

test('patient runtime has no direct appointment table grant', () => {
  assert.equal(
    directGrants('public.be_appointments').some((grant) => grant.role === 'app_patient'),
    false,
  );
});

test('clinical visit insert uses only the canonical appointment link', () => {
  const grant = grantFor('public.clinical_visit', 'app_staff', 'INSERT');
  assert.notEqual(grant.columns, 'table');
  assert.equal(grant.columns.includes('canonical_appointment_id'), true);
  assert.equal(grant.columns.includes('appointment_record_id'), false);
});

test('tenant calendar and package roots expose only their proven columns', () => {
  exactColumns('public.be_appointments', 'app_tenant_service', 'SELECT', [
    'id',
    'package_usage_ref',
  ]);
  exactColumns('public.be_appointments', 'app_tenant_service', 'UPDATE', [
    'platform_user_id',
  ]);
  exactColumns('public.be_package_usages', 'app_tenant_service', 'SELECT', [
    'id',
    'patient_package_id',
    'usage_kind',
    'occurred_at',
  ]);
  exactColumns('public.be_patient_package_items', 'app_tenant_service', 'SELECT', [
    'patient_package_id',
    'quantity_initial',
    'sort_order',
  ]);
  exactColumns('public.be_patient_packages', 'app_tenant_service', 'SELECT', [
    'id',
    'sold_at',
    'created_at',
  ]);
  exactColumns('public.be_patient_packages', 'app_tenant_service', 'UPDATE', [
    'platform_user_id',
  ]);
});

test('tenant identity grant is operation- and column-specific', () => {
  exactColumns('public.platform_users', 'app_tenant_service', 'SELECT', [
    'id',
    'phone_normalized',
    'patient_phone_trust_at',
    'integrator_user_id',
    'merged_into_id',
    'display_name',
    'first_name',
    'last_name',
    'patronymic',
    'email',
    'email_verified_at',
    'role',
    'created_at',
    'email_normalized',
    'updated_at',
  ]);
  exactColumns('public.platform_users', 'app_tenant_service', 'INSERT', [
    'id',
    'integrator_user_id',
    'phone_normalized',
    'display_name',
    'first_name',
    'last_name',
    'email',
    'email_verified_at',
    'patient_phone_trust_at',
    'role',
  ]);
  exactColumns('public.platform_users', 'app_tenant_service', 'UPDATE', [
    'phone_normalized',
    'patient_phone_trust_at',
    'integrator_user_id',
    'merged_into_id',
    'merged_at',
    'display_name',
    'first_name',
    'last_name',
    'email',
    'email_normalized',
    'updated_at',
  ]);
  assertNoOperation('public.platform_users', 'app_tenant_service', 'DELETE');
});

test('merge-only tenant updates cannot mutate unrelated payment or timeline columns', () => {
  for (const relation of [
    'public.be_patient_timeline_events',
    'public.be_payment_history_events',
    'public.be_payment_intents',
    'public.be_payments',
  ]) {
    exactColumns(relation, 'app_tenant_service', 'UPDATE', ['platform_user_id']);
  }
});

test('staff matrix omits unsupported mutations and scopes retained writes', () => {
  assertNoOperation('public.be_package_items', 'app_staff', 'UPDATE');
  assertNoOperation('public.be_patient_package_items', 'app_staff', 'UPDATE');
  assertNoOperation('public.be_subscription_packages', 'app_staff', 'DELETE');
  assertNoOperation('public.be_specialist_rooms', 'app_staff', 'DELETE');
  assertNoOperation('public.recommendation_regions', 'app_staff', 'UPDATE');

  for (const relation of [
    'public.be_appointments',
    'public.be_availability_rules',
    'public.be_booking_form_fields',
    'public.be_booking_form_submissions',
    'public.be_branches',
    'public.be_cancellation_policies',
    'public.be_package_items',
    'public.be_package_usages',
    'public.be_patient_package_items',
    'public.be_patient_packages',
    'public.be_reschedule_policies',
    'public.be_rooms',
    'public.be_specialist_rooms',
    'public.be_subscription_packages',
    'public.recommendation_regions',
  ]) {
    for (const operation of ['INSERT', 'UPDATE']) {
      for (const grant of directGrants(relation)) {
        if (grant.role === 'app_staff' && grant.operations.includes(operation)) {
          assert.notEqual(grant.columns, 'table', `${relation} ${operation}`);
        }
      }
    }
  }
});

test('no direct INSERT or UPDATE grant is table-wide', () => {
  for (const [relation, access] of Object.entries(REV10_CLINICAL_ACCESS)) {
    if (access.kind !== 'direct') continue;
    for (const grant of access.grants) {
      if (grant.operations.some((operation) => operation === 'INSERT' || operation === 'UPDATE')) {
        assert.notEqual(grant.columns, 'table', `${relation} ${grant.role}`);
      }
    }
  }
});

test('phone completion is not a database role or direct relation grantee', () => {
  for (const access of Object.values(REV10_CLINICAL_ACCESS)) {
    if (access.kind !== 'direct') continue;
    assert.equal(access.grants.some((grant) => grant.role === 'app_phone_bind_completion'), false);
  }
  assert.equal(REV10_CLINICAL_ACCESS['public.admin_audit_log'], undefined);
});

test('pre-session and secret roots do not receive direct relation grants', () => {
  for (const access of Object.values(REV10_CLINICAL_ACCESS)) {
    if (access.kind !== 'direct') continue;
    assert.equal(
      access.grants.some((grant) => grant.role === 'app_pre_session'),
      false,
    );
  }
  assert.equal(REV10_CLINICAL_ACCESS['public.phone_messenger_bind_secrets'], undefined);
});

test('system settings grants follow semantic clinic/global walls', () => {
  const table = declaration.databases.bersoncarebot_test.tables['public.system_settings'];
  assert.equal(table.access.kind, 'direct');
  assert.deepEqual(
    table.access.grants.filter((grant) => grant.role === 'app_staff')
      .flatMap((grant) => grant.operations),
    ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  );
  assert.deepEqual(
    table.access.grants.find((grant) =>
      grant.role === 'app_staff' && grant.operations.includes('UPDATE'))?.columns,
    ['value_json', 'updated_at', 'updated_by'],
  );
  const policies = table.policies.filter((policy) =>
    policy.name.startsWith('rev10_system_settings_'));
  assert.deepEqual(policies.map((policy) => policy.cmd), ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  assert.match(policies[0].using, /scope = 'doctor'/);
  assert.match(policies[0].using, /organization_id = app\.current_org_id\(\)/);
  assert.match(policies[0].using, /app_platform_settings/);
  assert.doesNotMatch(policies[1].withCheck, /scope = 'doctor'/);
  assert.match(policies[1].withCheck, /organization_id = app\.current_org_id\(\)/);
});

test('runtime settings and account email use semantic row walls without broad patient identity access', () => {
  const tables = declaration.databases.bersoncarebot_test.tables;
  const runtime = tables['public.app_runtime_settings'];
  assert.equal(runtime.access.kind, 'direct');
  assert.deepEqual(
    runtime.access.grants.find((grant) => grant.role === 'app_patient')?.operations,
    ['SELECT'],
  );
  const runtimeSelect = runtime.policies.find((policy) =>
    policy.name.startsWith('rev10_app_runtime_settings_select_'));
  assert.match(runtimeSelect?.using ?? '', /audience IN \('public','authenticated_client'\)/);
  assert.match(runtimeSelect?.using ?? '', /CASE WHEN organization_id IS NULL THEN true/);
  assert.match(runtimeSelect?.using ?? '', /organization_id = app\.current_org_id\(\)/);

  const users = tables['public.platform_users'];
  assert.equal(users.access.kind, 'direct');
  assert.deepEqual(
    users.access.grants.find((grant) =>
      grant.role === 'app_patient' && Array.isArray(grant.columns))?.columns,
    ['id', 'email', 'email_verified_at'],
  );
  const patientSelect = users.policies.find((policy) =>
    policy.name.startsWith('rev10_platform_users_patient_select_'));
  const staffSelect = users.policies.find((policy) =>
    policy.name.startsWith('rev10_platform_users_staff_select_'));
  const platformSelect = users.policies.find((policy) =>
    policy.name.startsWith('rev10_platform_users_platform_select_'));
  assert.deepEqual(patientSelect?.to, ['app_patient']);
  assert.match(patientSelect?.using ?? '', /id = app\.current_patient_user_id\(\)/);
  assert.doesNotMatch(patientSelect?.using ?? '', /be_organization_members/);
  assert.deepEqual(staffSelect?.to, ['app_staff']);
  assert.match(staffSelect?.using ?? '', /access_member\.platform_user_id = platform_users\.id/);
  assert.deepEqual(platformSelect?.to, ['app_platform_settings']);
  assert.equal(platformSelect?.using, "(current_user = 'app_platform_settings'::name)");
  const staffUpdate = users.access.grants.find((grant) =>
    grant.role === 'app_staff' && grant.operations.includes('UPDATE'));
  assert.ok(Array.isArray(staffUpdate?.columns));
  assert.ok(staffUpdate.columns.includes('calendar_timezone'));
  assert.ok(staffUpdate.columns.includes('updated_at'));
  assert.deepEqual(
    users.access.grants.find((grant) =>
      grant.role === 'app_platform_settings' && grant.operations.includes('UPDATE'))?.columns,
    ['calendar_timezone', 'updated_at'],
  );
  const timezoneUpdate = users.policies.find((policy) =>
    policy.name.startsWith('rev10_platform_users_account_timezone_update_'));
  assert.deepEqual(timezoneUpdate?.to, ['app_staff', 'app_platform_settings']);
  assert.equal(timezoneUpdate?.using, '(id = app.current_actor_user_id())');
  assert.equal(timezoneUpdate?.withCheck, '(id = app.current_actor_user_id())');
});

test('patient notification preferences are product-complete and remain self-only', () => {
  const expected = {
    'public.user_channel_bindings': ['SELECT'],
    'public.user_channel_preferences': ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    'public.user_notification_topic_channels': ['INSERT', 'SELECT', 'UPDATE'],
    'public.user_notification_topics': ['INSERT', 'SELECT', 'UPDATE'],
    'public.user_phone_history': ['SELECT'],
    'public.user_web_push_subscriptions': ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  };
  for (const [relation, operations] of Object.entries(expected)) {
    const table = declaration.databases.bersoncarebot_test.tables[relation];
    assert.equal(table.access.kind, 'direct', relation);
    const patientGrants = table.access.grants.filter((grant) => grant.role === 'app_patient');
    assert.deepEqual(patientGrants.flatMap((grant) => grant.operations).sort(), operations, relation);
    const patientPolicy = table.policies.find((policy) =>
      policy.name.startsWith('rev10_patient_self_managed_'));
    const staffPolicy = table.policies.find((policy) =>
      policy.name.startsWith('rev10_staff_member_managed_'));
    assert.deepEqual(patientPolicy?.to, ['app_patient'], relation);
    assert.match(patientPolicy?.using ?? '', /app\.current_patient_user_id\(\)/, relation);
    assert.doesNotMatch(patientPolicy?.using ?? '', /be_organization_members/, relation);
    assert.deepEqual(staffPolicy?.to, ['app_staff'], relation);
    assert.match(staffPolicy?.using ?? '', /access_member\.platform_user_id =/, relation);
  }
});

test('tenant service has one command-aware D/M/P policy for every exact relation operation', () => {
  const expectedEdges = new Set();
  for (const [relation, access] of Object.entries(REV10_CLINICAL_ACCESS)) {
    if (access.kind !== 'direct') continue;
    for (const grant of access.grants) {
      if (grant.role !== 'app_tenant_service') continue;
      for (const operation of grant.operations) {
        if (['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(operation)) {
          expectedEdges.add(`${relation}:${operation}`);
        }
      }
    }
  }

  const tables = declaration.databases.bersoncarebot_test.tables;
  const actualEdges = new Set();
  const tenantRelations = new Set();
  for (const [relation, table] of Object.entries(tables)) {
    const permissiveTenantPolicies = table.policies.filter(
      (policy) => policy.as === 'PERMISSIVE' && policy.to.includes('app_tenant_service'),
    );
    for (const policy of permissiveTenantPolicies) {
      if (!policy.name.startsWith('rev10_tenant_')) {
        assert.equal(policy.using, 'false', `${relation} unexpected tenant permissive USING`);
        assert.equal(policy.withCheck, 'false', `${relation} unexpected tenant permissive WITH CHECK`);
        continue;
      }
      assert.match(policy.name, /^rev10_tenant_(select|insert|update|delete)_\d+$/, relation);
      assert.notEqual(policy.using, "(current_user = 'app_tenant_service'::name)", relation);
      assert.notEqual(policy.withCheck, "(current_user = 'app_tenant_service'::name)", relation);
      actualEdges.add(`${relation}:${policy.cmd}`);
      tenantRelations.add(relation);
    }
  }

  assert.equal(expectedEdges.size, 130, 'measured exact tenant operation census changed');
  assert.equal(tenantRelations.size, 61, 'measured exact tenant relation census changed');
  assert.deepEqual(actualEdges, expectedEdges);
});

test('tenant D inserts either carry organization_id or are absent when only non-tenant callers insert', () => {
  assertNoOperation('public.material_ratings', 'app_tenant_service', 'INSERT');
  assertNoOperation('public.patient_daily_warmup_presentations', 'app_tenant_service', 'INSERT');
  exactColumns('public.platform_user_contacts', 'app_tenant_service', 'INSERT', [
    'contact_type', 'created_at', 'organization_id', 'platform_user_id', 'source',
    'updated_at', 'value', 'value_normalized',
  ]);
  exactColumns('public.user_phone_history', 'app_tenant_service', 'INSERT', [
    'organization_id', 'phone_normalized', 'platform_user_id', 'source', 'valid_from', 'valid_to',
  ]);
});

test('tenant M and P predicates cover patient enrollment and qualified parent chains', () => {
  const tables = declaration.databases.bersoncarebot_test.tables;
  const policy = (relation, operation) => {
    const matches = tables[relation].policies.filter(
      (candidate) => candidate.as === 'PERMISSIVE'
        && candidate.to.includes('app_tenant_service')
        && candidate.cmd === operation,
    );
    assert.equal(matches.length, 1, `${relation} ${operation}`);
    return matches[0];
  };

  const platformSelect = policy('public.platform_users', 'SELECT').using;
  assert.match(platformSelect, /be_organization_members/);
  assert.match(platformSelect, /org_enrollments/);
  assert.match(platformSelect, /tenant_staff\.platform_user_id = platform_users\.id/);
  assert.match(platformSelect, /tenant_patient\.platform_user_id = platform_users\.id/);

  const bindingUpdate = policy('public.user_channel_bindings', 'UPDATE').withCheck;
  assert.match(bindingUpdate, /user_channel_bindings\.user_id/);
  assert.match(bindingUpdate, /org_enrollments/);

  const packageSelect = policy('public.be_patient_package_items', 'SELECT').using;
  assert.match(packageSelect, /be_patient_packages/);
  assert.match(packageSelect, /be_clinic_services/);
  assert.match(packageSelect, /be_patient_package_items\.patient_package_id/);
  assert.match(packageSelect, /be_patient_package_items\.service_id/);

  const supportInsert = policy('public.support_conversation_messages', 'INSERT').withCheck;
  assert.match(supportInsert, /support_conversation_messages\.conversation_id/);
  assert.match(supportInsert, /support_conversations tenant_conversation/);

  const programUpdate = policy('public.program_action_log', 'UPDATE').withCheck;
  assert.match(programUpdate, /program_action_log\.instance_id/);
  assert.match(programUpdate, /program_action_log\.instance_stage_item_id/);
  assert.match(programUpdate, /treatment_program_instance_stage_items/);
});

test('base port logins retain app schema usage needed to install transaction context', () => {
  for (const [database, logins] of [
    ['bcb_webapp_dev', ['bcb_dev_webapp_staff', 'bcb_dev_webapp_patient',
      'bcb_dev_webapp_global_admin', 'bcb_dev_integrator']],
    ['bersoncarebot_test', ['bcb_test_webapp_staff', 'bcb_test_webapp_patient',
      'bcb_test_webapp_global_admin', 'bcb_test_integrator']],
  ]) {
    const usage = declaration.databases[database].schemas.app.usage;
    for (const login of logins) assert.ok(usage.includes(login), `${database}: ${login}`);
  }
});
