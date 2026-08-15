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

test('platform commercial scope is present in the active relation matrix and row walls', () => {
  const expected = {
    'public.be_organizations': ['SELECT', 'UPDATE'],
    'public.be_branches': ['SELECT'],
    'public.be_clinic_services': ['SELECT'],
    'public.saas_org_entitlement_overrides': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'public.saas_organization_trials': ['SELECT', 'INSERT', 'UPDATE'],
    'public.saas_trial_policy': ['SELECT', 'INSERT', 'UPDATE'],
    'public.saas_registration_tariff_policy': ['SELECT', 'INSERT', 'UPDATE'],
  };
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const tables = declaration.databases[dbName].tables;
    for (const [relation, operations] of Object.entries(expected)) {
      const access = tables[relation].access;
      assert.equal(access.kind, 'direct', `${dbName}:${relation}`);
      const actual = [...new Set(access.grants
        .filter((grant) => grant.role === 'app_platform_settings')
        .flatMap((grant) => grant.operations))].sort();
      assert.deepEqual(actual, [...operations].sort(), `${dbName}:${relation}`);
      const platformBusiness = tables[relation].policies.filter((policy) =>
        policy.as === 'PERMISSIVE' && policy.to.includes('app_platform_settings'));
      assert.ok(platformBusiness.length > 0, `${dbName}:${relation}:platform row wall`);
      assert.ok(platformBusiness.some((policy) =>
        (policy.using ?? '').includes("current_user = 'app_platform_settings'::name")),
      `${dbName}:${relation}:platform predicate`);
    }
  }
});

test('staff security identity-self helper accepts both physical self principals', () => {
  const helper = declaration.portContext.functions['app.require_staff_security_self_user_id()'];
  assert.deepEqual(helper.execute, ['app_patient', 'app_staff']);
  for (const outerIdentity of [
    'app.get_staff_security_profile()',
    'app.get_staff_security_session_state()',
    'app.ensure_staff_security_profile()',
  ]) {
    const outer = declaration.portContext.functions[outerIdentity];
    assert.ok(outer.execute.includes('app_patient'), outerIdentity);
  }
});

test('platform registration journal is a sanitized named root, not a raw relation grant', () => {
  const identity = 'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)';
  const root = declaration.portContext.functions[identity];
  assert.equal(root.owner, 'app_seam_telemetry_exclusion_owner');
  assert.deepEqual(root.execute, ['app_platform_settings']);
  assert.deepEqual(root.relationSurfaces, [{
    relation: 'public.product_analytics_events_recent',
    columns: ['id', 'occurred_at', 'event_type', 'entry_channel', 'user_id', 'metadata'],
    operations: ['SELECT'],
    evidence: 'pg16-function-body-lexical-upper-bound',
  }]);
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const access = declaration.databases[dbName].tables[
      'public.product_analytics_events_recent'
    ].access;
    assert.equal(access.kind, 'direct');
    assert.equal(access.grants.some((grant) => grant.role === 'app_platform_settings'), false);
    assert.ok(access.seams.some((seam) => seam.regprocedure === identity));
  }
});

test('patient runtime has no direct appointment table grant', () => {
  assert.equal(
    directGrants('public.be_appointments').some((grant) => grant.role === 'app_patient'),
    false,
  );
});

test('patient booking catalog is exposed only through its signed organization root', () => {
  const identity = 'app.read_current_patient_booking_catalog()';
  const root = declaration.portContext.functions[identity];
  assert.equal(root.owner, 'app_seam_patient_booking_owner');
  assert.deepEqual(root.execute, ['app_patient']);
  assert.deepEqual(
    root.relationSurfaces.map((surface) => surface.relation).sort(),
    [
      'public.be_branches',
      'public.be_clinic_services',
      'public.be_specialist_service_availability',
      'public.be_specialists',
      'public.org_enrollments',
    ].sort(),
  );
  for (const relation of [
    'public.be_branches',
    'public.be_clinic_services',
    'public.be_specialist_service_availability',
    'public.be_specialists',
  ]) {
    assert.equal(
      directGrants(relation).some((grant) => grant.role === 'app_patient'),
      false,
      relation,
    );
  }
});

test('patient reminder history is readable and only its seen cursor is mutable', () => {
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const table = declaration.databases[dbName].tables['public.reminder_occurrence_history'];
    assert.equal(table.access.kind, 'direct');
    const patientGrants = table.access.grants.filter((grant) => grant.role === 'app_patient');
    assert.deepEqual(patientGrants, [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
      { role: 'app_patient', operations: ['UPDATE'], columns: ['seen_at'] },
    ]);
    const policy = table.policies.find((candidate) =>
      candidate.name.startsWith('rev10_direct_business_'));
    assert.deepEqual(policy?.to, ['app_patient', 'app_staff']);
    assert.match(policy?.using ?? '', /platform_user_id = app\.current_patient_user_id\(\)/u);
    assert.match(policy?.using ?? '', /organization_id = app\.current_org_id\(\)/u);
    assertNoOperation('public.reminder_occurrence_history', 'app_tenant_service', 'INSERT');
    assertNoOperation('public.reminder_occurrence_history', 'app_staff', 'INSERT');
    assert.equal(table.policies.some((candidate) =>
      candidate.name.startsWith('rev10_tenant_insert_')), false);
    const projection = declaration.portContext.functions[
      'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ];
    assert.deepEqual(projection.execute, ['app_tenant_service']);
    assert.deepEqual(projection.relationSurfaces, [
      {
        relation: 'public.org_enrollments',
        columns: ['organization_id', 'platform_user_id', 'status'],
        operations: ['SELECT'],
        evidence: 'pg16-function-body-lexical-upper-bound',
      },
      {
        relation: 'public.reminder_occurrence_history',
        columns: [
          'integrator_occurrence_id', 'integrator_rule_id', 'integrator_user_id', 'platform_user_id',
          'organization_id', 'category', 'status', 'delivery_channel', 'error_code', 'occurred_at',
        ],
        operations: ['INSERT'],
        evidence: 'pg16-function-body-lexical-upper-bound',
      },
    ]);
  }
});

test('tenant reminder-rule writer can cancel only pending integrator occurrences', () => {
  exactColumns(
    'integrator.user_reminder_occurrences',
    'app_tenant_service',
    'SELECT',
    ['rule_id', 'status'],
  );
  const deleteGrant = grantFor(
    'integrator.user_reminder_occurrences',
    'app_tenant_service',
    'DELETE',
  );
  assert.equal(deleteGrant.columns, 'table');
  for (const operation of ['INSERT', 'UPDATE']) {
    assertNoOperation('integrator.user_reminder_occurrences', 'app_tenant_service', operation);
  }
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const table = declaration.databases[dbName].tables['integrator.user_reminder_occurrences'];
    const tenantPolicy = table.policies.find((candidate) =>
      candidate.name.startsWith('rev10_tenant_delete_'));
    assert.deepEqual(tenantPolicy?.to, ['app_tenant_service']);
    assert.match(tenantPolicy?.using ?? '', /organization_id = app\.current_org_id\(\)/u);
  }
});

test('ON CONFLICT seams grant SELECT only on their exact arbiter columns', () => {
  const expected = [
    ['app.choose_organization_first_tariff(uuid,uuid)', 'public.saas_organization_trials', ['organization_id']],
    ['app.claim_unbound_patient_invite_email(text,text,text,bigint,text)', 'public.patient_merge_candidates',
      ['organization_id', 'anchor_user_id', 'candidate_user_id', 'status']],
    ['app.email_auth_enqueue_otp_delivery(uuid,uuid)', 'public.outgoing_delivery_queue', ['event_id']],
    ['app.ensure_staff_security_profile()', 'public.staff_security_profiles', ['user_id']],
    ['app.record_current_patient_push_open(timestamp with time zone,text,uuid)',
      'public.product_analytics_events_recent', ['push_tracking_id', 'event_type']],
    ['app.redeem_patient_invite_email(text)', 'public.patient_merge_candidates',
      ['organization_id', 'anchor_user_id', 'candidate_user_id', 'status']],
  ];
  for (const [signature, relation, columns] of expected) {
    const surface = declaration.portContext.functions[signature].relationSurfaces.find(
      (candidate) => candidate.relation === relation,
    );
    assert.deepEqual(surface?.operationColumns?.SELECT, columns, `${signature}:${relation}`);
    for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
      const grant = declaration.databases[dbName].tables[relation].grants[
        declaration.portContext.functions[signature].owner
      ];
      assert.equal(grant.privs.some((entry) => typeof entry === 'object'
        && entry.kind === 'columns' && entry.priv === 'SELECT'
        && JSON.stringify(entry.columns) === JSON.stringify([...columns].sort())), true,
      `${dbName}:${signature}:${relation}`);
    }
  }
});

test('reference catalogs are complete within the current clinic and only staff mutates items', () => {
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const tables = declaration.databases[dbName].tables;
    const categories = tables['public.reference_categories'];
    const items = tables['public.reference_items'];
    assert.equal(categories.access.kind, 'direct');
    assert.equal(items.access.kind, 'direct');
    assert.deepEqual(categories.access.grants, [
      { role: 'app_staff', operations: ['SELECT'], columns: 'table' },
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ]);
    assert.deepEqual(items.access.grants, [
      { role: 'app_staff', operations: ['SELECT'], columns: 'table' },
      { role: 'app_staff', operations: ['INSERT'],
        columns: ['category_id', 'code', 'is_active', 'meta_json', 'organization_id', 'sort_order', 'title'] },
      { role: 'app_staff', operations: ['UPDATE'],
        columns: ['code', 'deleted_at', 'is_active', 'organization_id', 'sort_order', 'title'] },
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
    ]);
    for (const table of [categories, items]) {
      const policy = table.policies.find((candidate) =>
        candidate.name.startsWith('rev10_direct_business_'));
      assert.deepEqual(policy?.to, ['app_patient', 'app_staff']);
      assert.match(policy?.using ?? '', /organization_id = app\.current_org_id\(\)/u);
    }
  }
});

test('patient symptom entries are self-owned and expose the full diary action set', () => {
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const table = declaration.databases[dbName].tables['public.symptom_entries'];
    assert.equal(table.access.kind, 'direct');
    const patientGrants = table.access.grants.filter((grant) => grant.role === 'app_patient');
    assert.deepEqual(patientGrants, [
      { role: 'app_patient', operations: ['SELECT'], columns: 'table' },
      { role: 'app_patient', operations: ['INSERT'], columns: [
        'entry_type', 'notes', 'patient_practice_completion_id', 'platform_user_id', 'recorded_at',
        'source', 'tracking_id', 'user_id', 'value_0_10',
      ] },
      { role: 'app_patient', operations: ['UPDATE'],
        columns: ['entry_type', 'notes', 'recorded_at', 'value_0_10'] },
      { role: 'app_patient', operations: ['DELETE'], columns: 'table' },
    ]);
    const policy = table.policies.find((candidate) =>
      candidate.name.startsWith('rev10_saas_org_dormant_'));
    assert.match(policy?.using ?? '', /"platform_user_id" = app\.current_patient_user_id\(\)/u);
    assert.deepEqual(policy?.to, ['app_patient', 'app_staff']);
  }
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
    'birth_date',
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
    'public.be_patient_timeline_events',
    'public.be_package_history_events',
    'public.be_package_usages',
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

test('clinic topology grants cover the exact columns emitted by Drizzle inserts', () => {
  const expected = {
    'public.be_branches': [
      'address', 'city_code', 'color', 'created_at', 'id', 'is_active', 'organization_id',
      'short_title', 'sort_order', 'timezone', 'title', 'updated_at',
    ],
    'public.be_clinic_services': [
      'admin_manual_only', 'buffer_after_minutes', 'created_at', 'description', 'duration_minutes',
      'id', 'is_active', 'online_payment_applicable', 'organization_id', 'prepayment_applicable',
      'price_minor', 'public_widget_visible', 'sort_order', 'title', 'updated_at',
      'usable_in_packages',
    ],
    'public.be_rooms': [
      'branch_id', 'created_at', 'id', 'is_active', 'organization_id', 'sort_order', 'title',
      'updated_at',
    ],
    'public.be_service_location_availability': [
      'branch_id', 'created_at', 'id', 'is_active', 'organization_id', 'service_id',
    ],
    'public.be_specialist_locations': [
      'branch_id', 'created_at', 'id', 'is_active', 'organization_id', 'specialist_id',
    ],
    'public.be_specialist_rooms': [
      'created_at', 'id', 'is_active', 'organization_id', 'room_id', 'specialist_id',
    ],
    'public.be_specialists': [
      'appointment_reminder_allowed_preset_ids', 'appointment_reminder_default_preset_id',
      'created_at', 'description', 'full_name', 'id', 'is_active', 'organization_id', 'sort_order',
      'updated_at',
    ],
    'public.be_specialist_service_availability': [
      'branch_id', 'city_code', 'created_at', 'id', 'is_active', 'organization_id',
      'price_minor_override', 'room_id', 'service_id', 'sort_order', 'specialist_id', 'updated_at',
    ],
  };
  for (const [relation, columns] of Object.entries(expected)) {
    exactColumns(relation, 'app_staff', 'INSERT', columns);
  }
  exactColumns('public.be_branches', 'app_staff', 'UPDATE', [
    'address', 'city_code', 'color', 'is_active', 'short_title', 'sort_order', 'timezone', 'title',
    'updated_at',
  ]);
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

test('billing relations use the clinic, platform, and webhook worker roles without ordinary staff mutation', () => {
  for (const relation of [
    'public.saas_billing_accounts',
    'public.saas_billing_invoices',
    'public.saas_billing_provider_events',
    'public.saas_billing_refunds',
    'public.saas_billing_subscriptions',
  ]) {
    assertNoOperation(relation, 'app_staff', 'INSERT');
    assertNoOperation(relation, 'app_staff', 'UPDATE');
  }
  for (const relation of [
    'public.saas_billing_accounts',
    'public.saas_billing_invoices',
    'public.saas_billing_subscriptions',
    'public.saas_tariffs',
  ]) {
    grantFor(relation, 'app_clinic_billing', 'SELECT');
  }
  exactColumns('public.saas_billing_provider_events', 'app_clinic_billing', 'SELECT', [
    'id', 'organization_id', 'saas_billing_invoice_id', 'provider_id', 'provider_event_id',
    'event_type', 'processed_at', 'created_at',
  ]);
  assertNoOperation('public.saas_billing_provider_events', 'app_clinic_billing', 'INSERT');
  assertNoOperation('public.saas_billing_provider_events', 'app_clinic_billing', 'UPDATE');
  assertNoOperation('public.saas_billing_refunds', 'app_clinic_billing', 'SELECT');
  exactColumns('public.saas_billing_subscriptions', 'app_staff', 'SELECT', [
    'organization_id', 'status', 'current_period_ends_at', 'paid_additional_seats', 'source',
  ]);
  for (const relation of [
    'public.saas_billing_invoices',
    'public.saas_billing_provider_events',
    'public.saas_billing_refunds',
    'public.saas_billing_subscriptions',
    'public.saas_tariffs',
  ]) {
    grantFor(relation, 'app_worker', 'SELECT');
    grantFor(relation, 'app_platform_settings', 'SELECT');
  }
  for (const relation of [
    'public.saas_billing_invoices',
    'public.saas_billing_provider_events',
    'public.saas_billing_refunds',
    'public.saas_billing_subscriptions',
  ]) {
    grantFor(relation, 'app_worker', 'UPDATE');
  }
  assertNoOperation('public.saas_tariffs', 'app_clinic_billing', 'UPDATE');
  assertNoOperation('public.saas_tariffs', 'app_worker', 'UPDATE');
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    grantFor('public.saas_tariffs', 'app_platform_settings', operation);
  }

  const tables = declaration.databases.bersoncarebot_test.tables;
  for (const relation of [
    'public.saas_billing_accounts',
    'public.saas_billing_invoices',
    'public.saas_billing_provider_events',
    'public.saas_billing_refunds',
    'public.saas_billing_subscriptions',
  ]) {
    const policy = tables[relation].policies.find((candidate) =>
      candidate.name.startsWith('rev10_direct_business_'));
    assert.match(policy?.using ?? '', /app_platform_settings.*THEN true/, relation);
    assert.match(policy?.using ?? '', /organization_id = app\.current_org_id\(\)/, relation);
  }
});

test('webhook error events have only exact outcome, aggregate and retention seams', () => {
  const access = declaration.databases.bcb_webapp_dev.tables[
    'public.integration_webhook_error_events'
  ].access;
  assert.equal(access.kind, 'named-seams');
  assert.deepEqual(access.seams.map((seam) => seam.regprocedure).sort(), [
    'app.list_integration_webhook_burst_signals(integer,integer)',
    'app.prune_integration_webhook_error_events(integer)',
    'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)',
  ]);
  assert.equal(access.seams.some((seam) => seam.callers.includes('app_worker')), true);
  assert.equal(access.seams.some((seam) => seam.callers.includes('app_service')), true);
});

test('staff reads only the global paid-period rule needed for its own access calculation', () => {
  const table = declaration.databases.bersoncarebot_test.tables['public.saas_paid_period_policy'];
  assert.equal(table.access.kind, 'direct');
  const staff = table.access.grants.find((grant) => grant.role === 'app_staff');
  assert.deepEqual(staff?.operations, ['SELECT']);
  assert.deepEqual(staff?.columns, [
    'key', 'post_paid_period_behavior', 'post_paid_period_tariff_id', 'is_active',
  ]);
  assert.equal(
    table.access.grants.some((grant) =>
      grant.role === 'app_staff' && grant.operations.some((operation) => operation !== 'SELECT')),
    false,
  );
});

test('lifecycle notification seam can read the value returned by its organization update', () => {
  const fn = declaration.portContext.functions[
    'app.prepare_organization_lifecycle_notification_context(uuid)'
  ];
  const organization = fn.relationSurfaces.find(
    (surface) => surface.relation === 'public.be_organizations',
  );
  assert.deepEqual([...organization.operations].sort(), ['SELECT', 'UPDATE']);
  assert.deepEqual([...organization.columns].sort(), [
    'cabinet_first_entered_at', 'id', 'updated_at',
  ]);
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

  const runtimeAudit = tables['public.app_runtime_settings_audit'];
  assert.equal(runtimeAudit.access.kind, 'named-seams');
  assert.equal(runtimeAudit.policies.some((policy) =>
    policy.to.includes('app_platform_settings') && policy.cmd === 'SELECT'), false);
  assert.ok(runtimeAudit.policies.some((policy) =>
    policy.to.includes('app_object_owner') && policy.name.startsWith('rev10_seam_business_')));
  const auditTrigger = declaration.portContext.functions[
    'public.audit_app_runtime_settings_change()'
  ];
  assert.equal(auditTrigger.security, 'DEFINER');
  assert.equal(auditTrigger.owner, 'app_object_owner');
  assert.deepEqual(auditTrigger.execute, []);
  assert.deepEqual(auditTrigger.relationSurfaces, [{
    relation: 'public.app_runtime_settings_audit',
    columns: ['audience', 'key', 'new_value_json', 'old_value_json', 'organization_id', 'scope', 'source',
      'updated_by'],
    operations: ['INSERT'],
    evidence: 'pg16-function-body-lexical-upper-bound',
  }]);

  const users = tables['public.platform_users'];
  assert.equal(users.access.kind, 'direct');
  assert.deepEqual(
    users.access.grants.find((grant) =>
      grant.role === 'app_patient' && Array.isArray(grant.columns))?.columns,
    ['id', 'email', 'email_verified_at', 'calendar_timezone', 'integrator_user_id',
      'merged_into_id', 'display_name', 'role', 'session_epoch', 'is_archived',
      'reminder_muted_until'],
  );
  const identity = tables['public.user_identity'];
  assert.equal(identity.access.kind, 'direct');
  assert.deepEqual(
    identity.access.grants.find((grant) => grant.role === 'app_patient')?.columns,
    ['platform_user_id', 'display_name', 'first_name', 'last_name', 'patronymic'],
  );
  assert.deepEqual(
    users.access.grants.find((grant) =>
      grant.role === 'app_patient' && grant.operations.includes('UPDATE'))?.columns,
    ['calendar_timezone', 'reminder_muted_until', 'updated_at'],
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
  assert.match(staffSelect?.using ?? '', /access_patient\.platform_user_id = platform_users\.id/);
  assert.match(staffSelect?.using ?? '', /access_patient\.organization_id = app\.current_org_id\(\)/);
  assert.match(staffSelect?.using ?? '', /access_patient\.status IN \('invited', 'active'\)/);
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
  assert.deepEqual(timezoneUpdate?.to, ['app_patient', 'app_staff', 'app_platform_settings']);
  assert.equal(timezoneUpdate?.using, '(id = app.current_actor_user_id())');
  assert.equal(timezoneUpdate?.withCheck, '(id = app.current_actor_user_id())');
});

test('patient page relations have exact self/current-clinic access and published content walls', () => {
  const tables = declaration.databases.bersoncarebot_test.tables;
  const patientReadRelations = [
    'public.be_patient_package_items',
    'public.be_patient_packages',
    'public.be_payment_history_events',
    'public.content_pages',
    'public.content_section_slug_history',
    'public.content_sections',
    'public.lfk_complexes',
    'public.patient_home_block_items',
    'public.patient_home_blocks',
    'public.patient_daily_warmup_presentations',
    'public.patient_diary_day_snapshots',
    'public.patient_practice_completions',
    'public.reminder_journal',
    'public.reminder_rules',
    'public.program_action_log',
    'public.program_item_discussion_messages',
    'public.program_item_discussion_reads',
    'public.support_conversation_messages',
    'public.support_conversations',
    'public.symptom_trackings',
    'public.test_attempts',
    'public.test_results',
    'public.treatment_program_events',
    'public.treatment_program_instance_stage_groups',
    'public.treatment_program_instance_stage_items',
    'public.treatment_program_instance_stages',
    'public.treatment_program_instances',
    'public.user_contacts',
    'public.user_identity',
  ];
  for (const relation of patientReadRelations) {
    const table = tables[relation];
    assert.equal(table.access.kind, 'direct', relation);
    assert.equal(
      table.access.grants.some((grant) =>
        grant.role === 'app_patient' && grant.operations.includes('SELECT')),
      true,
      relation,
    );
    const gate = table.policies.find((policy) => policy.name.startsWith('rev10_context_gate_'));
    assert.equal(gate?.to.includes('app_patient'), true, relation);
  }

  const pages = tables['public.content_pages'];
  const pagePolicy = pages.policies.find((policy) => policy.name.startsWith('rev10_direct_business_'));
  assert.match(pagePolicy?.using ?? '', /organization_id = app\.current_org_id\(\)/);
  assert.match(pagePolicy?.using ?? '', /is_published = true/);
  assert.match(pagePolicy?.using ?? '', /archived_at IS NULL/);
  assert.match(pagePolicy?.using ?? '', /deleted_at IS NULL/);

  const sections = tables['public.content_sections'];
  const sectionPolicy = sections.policies.find((policy) => policy.name.startsWith('rev10_direct_business_'));
  assert.match(sectionPolicy?.using ?? '', /is_visible = true/);

  for (const relation of ['public.patient_home_blocks', 'public.patient_home_block_items']) {
    const policy = tables[relation].policies.find((candidate) =>
      candidate.name.startsWith('rev10_patient_home_catalog_'));
    assert.match(policy?.using ?? '', /organization_id = app\.current_org_id\(\)/u, relation);
    assert.match(policy?.using ?? '', /is_visible = true/u, relation);
    assert.doesNotMatch(policy?.withCheck ?? '', /app_patient/u, relation);
    assert.equal(tables[relation].access.grants.some((grant) =>
      grant.role === 'app_patient' && grant.operations.some((operation) => operation !== 'SELECT')),
    false, relation);
  }

  for (const relation of [
    'public.be_patient_packages',
    'public.be_payment_history_events',
    'public.patient_diary_day_snapshots',
  ]) {
    const policy = tables[relation].policies.find((candidate) =>
      candidate.to.includes('app_patient') && candidate.name.startsWith('rev10_saas_org_'));
    assert.match(policy?.using ?? '', /"?organization_id"? = app\.current_org_id\(\)/u, relation);
    assert.match(policy?.using ?? '', /"?platform_user_id"? = app\.current_patient_user_id\(\)/u, relation);
  }
  const practicePolicy = tables['public.patient_practice_completions'].policies.find((candidate) =>
    candidate.to.includes('app_patient') && candidate.name.startsWith('rev10_saas_org_'));
  assert.match(practicePolicy?.using ?? '', /"?organization_id"? = app\.current_org_id\(\)/u);
  assert.match(practicePolicy?.using ?? '', /"?user_id"? = app\.current_patient_user_id\(\)/u);
  const warmupPresentationPolicy = tables['public.patient_daily_warmup_presentations'].policies.find(
    (candidate) => candidate.to.includes('app_patient') && candidate.name.startsWith('rev10_saas_org_'),
  );
  assert.match(warmupPresentationPolicy?.using ?? '', /"?organization_id"? = app\.current_org_id\(\)/u);
  assert.match(warmupPresentationPolicy?.using ?? '', /"?user_id"? = app\.current_patient_user_id\(\)/u);
  const packageItemsPolicy = tables['public.be_patient_package_items'].policies.find((candidate) =>
    candidate.to.includes('app_patient') && candidate.name.startsWith('rev10_saas_org_'));
  assert.match(packageItemsPolicy?.using ?? '', /be_patient_packages/u);
  assert.match(packageItemsPolicy?.using ?? '', /platform_user_id.*app\.current_patient_user_id\(\)/u);

  exactColumns('public.patient_diary_day_snapshots', 'app_patient', 'INSERT', [
    'captured_at',
    'iana',
    'local_date',
    'organization_id',
    'plan_done_mask',
    'plan_instance_id',
    'plan_item_ids',
    'platform_user_id',
    'warmup_all_done',
    'warmup_done_count',
    'warmup_slot_limit',
  ]);
  exactColumns('public.patient_practice_completions', 'app_patient', 'INSERT', [
    'content_page_id',
    'feeling',
    'notes',
    'organization_id',
    'source',
    'user_id',
  ]);
  exactColumns('public.patient_practice_completions', 'app_patient', 'UPDATE', ['feeling']);
  exactColumns('public.patient_daily_warmup_presentations', 'app_patient', 'SELECT', [
    'content_page_id',
    'last_rotation_at',
    'skip_next_scheduled_rotation',
    'user_id',
  ]);
  exactColumns('public.patient_daily_warmup_presentations', 'app_patient', 'INSERT', [
    'content_page_id',
    'last_rotation_at',
    'organization_id',
    'skip_next_scheduled_rotation',
    'updated_at',
    'user_id',
  ]);
  exactColumns('public.patient_daily_warmup_presentations', 'app_patient', 'UPDATE', [
    'content_page_id',
    'last_rotation_at',
    'skip_next_scheduled_rotation',
    'updated_at',
  ]);
  exactColumns('public.patient_daily_warmup_video_views', 'app_patient', 'INSERT', [
    'content_page_id',
    'organization_id',
    'user_id',
  ]);
  exactColumns('public.be_patient_timeline_events', 'app_patient', 'SELECT', [
    'domain',
    'event_type',
    'id',
    'linked_object_id',
    'linked_object_type',
    'occurred_at',
    'organization_id',
    'payload',
    'platform_user_id',
  ]);
  exactColumns('public.be_package_history_events', 'app_patient', 'SELECT', [
    'event_type',
    'id',
    'occurred_at',
    'organization_id',
    'patient_package_id',
    'payload_json',
  ]);
  exactColumns('public.be_package_usages', 'app_patient', 'SELECT', [
    'appointment_id',
    'comment',
    'id',
    'occurred_at',
    'organization_id',
    'patient_package_id',
    'usage_kind',
  ]);
  for (const relation of [
    'public.be_package_history_events',
    'public.be_package_usages',
  ]) {
    const policy = tables[relation].policies.find((candidate) =>
      candidate.to.includes('app_patient') && candidate.name.startsWith('rev10_saas_org_'));
    assert.match(policy?.using ?? '', /app\.current_patient_user_id\(\)/u, relation);
  }

  const patientMessages = tables['public.support_conversation_messages'].access.grants
    .filter((grant) => grant.role === 'app_patient');
  assert.deepEqual(
    patientMessages.find((grant) => grant.operations.includes('UPDATE'))?.columns,
    ['read_at'],
  );
  assert.equal(patientMessages.some((grant) => grant.operations.includes('DELETE')), false);

  assert.deepEqual(
    tables['public.user_channel_bindings'].access.grants.find((grant) =>
      grant.role === 'app_patient' && grant.operations.includes('SELECT'))?.columns,
    ['channel_code', 'created_at', 'external_id', 'user_id'],
  );

  const supportPolicy = tables['public.support_conversations'].policies.find((policy) =>
    policy.name.startsWith('rev10_direct_business_'));
  assert.match(supportPolicy?.using ?? '', /platform_user_id = app\.current_patient_user_id\(\)/);
  assert.match(supportPolicy?.using ?? '', /organization_id IS NULL OR organization_id = app\.current_org_id\(\)/);

  for (const [relation, table] of Object.entries(tables)) {
    for (const policy of table.policies) {
      if (!policy.to.includes('app_staff')) continue;
      for (const predicate of [policy.using, policy.withCheck]) {
        if (!predicate?.includes('app.current_patient_user_id()')) continue;
        assert.match(
          predicate,
          /CASE\s+WHEN\s+current_user/u,
          `${relation}.${policy.name} must class-branch before calling the strict patient accessor`,
        );
      }
    }
  }

  const patientProgramOperations = {
    'public.program_action_log': ['DELETE', 'INSERT', 'SELECT'],
    'public.program_item_discussion_messages': ['INSERT', 'SELECT'],
    'public.program_item_discussion_reads': ['INSERT', 'SELECT', 'UPDATE'],
    'public.test_attempts': ['INSERT', 'SELECT', 'UPDATE'],
    'public.test_results': ['INSERT', 'SELECT', 'UPDATE'],
    'public.treatment_program_events': ['INSERT', 'SELECT'],
    'public.treatment_program_instance_stage_groups': ['SELECT'],
    'public.treatment_program_instance_stage_items': ['SELECT', 'UPDATE'],
    'public.treatment_program_instance_stages': ['SELECT', 'UPDATE'],
    'public.treatment_program_instances': ['SELECT', 'UPDATE'],
  };
  for (const [relation, operations] of Object.entries(patientProgramOperations)) {
    const patientGrants = tables[relation].access.grants.filter((grant) => grant.role === 'app_patient');
    assert.deepEqual(patientGrants.flatMap((grant) => grant.operations).sort(), operations, relation);
    const business = tables[relation].policies.find((policy) =>
      policy.to.includes('app_patient') && !policy.name.startsWith('rev10_context_gate_'));
    assert.match(business?.using ?? '',
      /app\.current_patient_user_id\(\) IS NOT NULL AND "organization_id" = app\.current_org_id\(\)/,
      relation);
  }

  const patientProgramInsertColumns = {
    'public.program_action_log': [
      'action_type', 'created_at', 'id', 'instance_id', 'instance_stage_item_id', 'note', 'organization_id',
      'patient_user_id', 'payload', 'session_id',
    ],
    'public.program_item_discussion_messages': [
      'body', 'created_at', 'id', 'instance_stage_item_id', 'media_file_id', 'organization_id', 'origin',
      'patient_user_id', 'sender_role', 'support_message_id',
    ],
    'public.program_item_discussion_reads': [
      'instance_stage_item_id', 'last_read_at', 'organization_id', 'patient_user_id',
    ],
    'public.test_attempts': [
      'accepted_at', 'accepted_by', 'id', 'instance_stage_item_id', 'organization_id', 'patient_user_id',
      'started_at', 'submitted_at',
    ],
    'public.test_results': [
      'attempt_id', 'created_at', 'decided_by', 'id', 'normalized_decision', 'organization_id', 'raw_value',
      'test_id',
    ],
    'public.treatment_program_events': [
      'actor_id', 'created_at', 'event_type', 'id', 'instance_id', 'organization_id', 'payload', 'reason',
      'target_id', 'target_type',
    ],
  };
  for (const [relation, columns] of Object.entries(patientProgramInsertColumns)) {
    const insert = tables[relation].access.grants.find((grant) =>
      grant.role === 'app_patient' && grant.operations.includes('INSERT'));
    assert.deepEqual([...insert.columns].sort(), [...columns].sort(), relation);
  }
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
    assert.match(staffPolicy?.using ?? '', /access_patient\.platform_user_id =/, relation);
    assert.match(staffPolicy?.using ?? '', /access_patient\.organization_id = app\.current_org_id\(\)/, relation);
  }
});

test('patient material rating rows remain self-only and aggregate access uses one named root', () => {
  for (const dbName of ['bcb_webapp_dev', 'bersoncarebot_test']) {
    const tables = declaration.databases[dbName].tables;
    const ratings = tables['public.material_ratings'];
    const ratingPatientGrants = ratings.access.grants.filter(
      (grant) => grant.role === 'app_patient',
    );
    assert.deepEqual(ratingPatientGrants, [
      { role: 'app_patient', operations: ['SELECT'],
        columns: ['organization_id', 'stars', 'target_id', 'target_kind', 'user_id'] },
      { role: 'app_patient', operations: ['INSERT'],
        columns: ['id', 'organization_id', 'stars', 'target_id', 'target_kind', 'updated_at', 'user_id'] },
      { role: 'app_patient', operations: ['UPDATE'], columns: ['stars', 'updated_at'] },
    ]);
    const ratingSelect = ratings.policies.find((policy) =>
      policy.name.startsWith('rev10_material_ratings_select_'));
    const ratingInsert = ratings.policies.find((policy) =>
      policy.name.startsWith('rev10_material_ratings_insert_'));
    const ratingUpdate = ratings.policies.find((policy) =>
      policy.name.startsWith('rev10_material_ratings_update_'));
    assert.deepEqual(ratingSelect?.to, ['app_staff', 'app_patient']);
    assert.match(ratingSelect?.using ?? '', /organization_id = app\.current_org_id\(\)/u);
    assert.match(ratingSelect?.using ?? '', /user_id = app\.current_patient_user_id\(\)/u);
    assert.match(ratingInsert?.withCheck ?? '', /user_id = app\.current_patient_user_id\(\)/u);
    assert.match(ratingUpdate?.using ?? '', /user_id = app\.current_patient_user_id\(\)/u);
    assert.match(ratingUpdate?.withCheck ?? '', /user_id = app\.current_patient_user_id\(\)/u);

    const snapshot = declaration.portContext.functions[
      'app.read_current_patient_material_rating_snapshot(text,uuid)'
    ];
    assert.equal(snapshot.owner, 'app_seam_patient_self_actions_owner');
    assert.deepEqual(snapshot.execute, ['app_patient']);
    assert.equal(snapshot.purpose, 'patient.material-rating.snapshot.read');
    assert.deepEqual(snapshot.relationSurfaces, [{
      relation: 'public.material_ratings',
      columns: ['organization_id', 'stars', 'target_id', 'target_kind', 'user_id'],
      operations: ['SELECT'],
      evidence: 'pg16-function-body-lexical-upper-bound',
    }]);
    assert.deepEqual(declaration.portContext.capabilities.patient_material_rating_snapshot, {
      port: 'webapp',
      runtimeName: 'patient_material_rating_snapshot',
      sessionRole: 'app_patient',
      targetRole: 'app_patient',
      contextClass: 'patient',
      purpose: 'patient.material-rating.snapshot.read',
      functionIdentity: 'app.read_current_patient_material_rating_snapshot(text,uuid)',
    });

    const feedback = tables['public.patient_content_rating_feedback'];
    assert.deepEqual(
      feedback.access.grants.filter((grant) => grant.role === 'app_patient'),
      [
        { role: 'app_patient', operations: ['SELECT'], columns: ['id'] },
        { role: 'app_patient', operations: ['INSERT'],
          columns: ['comment', 'content_page_id', 'created_at', 'id', 'organization_id', 'rating_value',
            'reason_codes', 'user_id'] },
      ],
    );
    const feedbackSelect = feedback.policies.find((policy) =>
      policy.name.startsWith('rev10_patient_rating_feedback_select_'));
    const feedbackInsert = feedback.policies.find((policy) =>
      policy.name.startsWith('rev10_patient_rating_feedback_insert_'));
    assert.deepEqual(feedbackSelect?.to, ['app_staff', 'app_patient']);
    assert.match(feedbackSelect?.using ?? '', /user_id = app\.current_patient_user_id\(\)/u);
    assert.match(feedbackInsert?.withCheck ?? '', /organization_id = app\.current_org_id\(\)/u);
    assert.match(feedbackInsert?.withCheck ?? '', /user_id = app\.current_patient_user_id\(\)/u);
  }
});

test('integrator user-to-organization pre-routing uses one exact resolver root', () => {
  assert.deepEqual(declaration.portContext.capabilities.integrator_user_organization_resolve, {
    port: 'integrator',
    runtimeName: 'integrator_user_organization_resolve',
    sessionRole: 'app_integrator_request',
    targetRole: 'app_integrator_resolver',
    contextClass: 'integrator',
    purpose: 'integrator.user-organization.resolve',
    functionIdentity: 'app.resolve_active_organization_for_integrator_user_id(bigint)',
  });
  const root = declaration.portContext.functions[
    'app.resolve_active_organization_for_integrator_user_id(bigint)'
  ];
  assert.equal(root.owner, 'app_seam_identity_lookup_owner');
  assert.deepEqual(root.execute, ['app_integrator_resolver']);
  assert.deepEqual(root.relationSurfaces, [
    { relation: 'public.platform_users', columns: ['id', 'integrator_user_id'],
      operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
    { relation: 'public.org_enrollments', columns: ['organization_id', 'platform_user_id', 'status'],
      operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
    { relation: 'public.be_organization_members', columns: ['organization_id', 'platform_user_id', 'status'],
      operations: ['SELECT'], evidence: 'pg16-function-body-lexical-upper-bound' },
  ]);
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

  assert.equal(expectedEdges.size, 132, 'measured exact tenant operation census changed');
  assert.equal(tenantRelations.size, 62, 'measured exact tenant relation census changed');
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
