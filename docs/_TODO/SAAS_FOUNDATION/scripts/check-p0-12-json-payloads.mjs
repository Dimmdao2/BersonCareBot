#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const artifactPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-12-json-payload-columns.tsv';
const tiersPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv';

const expectedRows = new Map([
  ['public.system_settings', 'value_json'],
  ['public.patient_merge_candidates', 'payload'],
  ['public.admin_audit_log', 'details'],
  ['public.message_log', 'text,channel_bindings_used,error_message'],
  ['public.notification_delivery_attempts', 'metadata,error_message,recipient_ref'],
  ['public.support_delivery_events', 'payload_json,reason'],
  ['public.reminder_delivery_events', 'payload_json,error_code'],
  ['public.content_access_grants_webapp', 'meta_json'],
  ['public.operator_health_failure_archive', 'summary_json,raw_error_truncated'],
  ['public.product_analytics_events_recent', 'metadata'],
  ['public.patient_diary_day_snapshots', 'plan_item_ids,plan_done_mask'],
  ['public.program_action_log', 'payload,note'],
  ['public.treatment_program_events', 'payload,reason'],
  ['public.treatment_program_template_stage_items', 'settings'],
  ['public.treatment_program_instance_stage_items', 'settings,snapshot,local_comment'],
  ['public.test_results', 'raw_value'],
  ['public.be_booking_form_submissions', 'attribution_json'],
  ['public.be_patient_timeline_events', 'payload'],
  ['public.be_appointment_history_events', 'payload'],
  ['public.be_payment_intents', 'metadata_json'],
  ['public.be_payment_provider_events', 'payload_json'],
  ['public.be_payment_history_events', 'payload_json'],
  ['public.be_package_history_events', 'payload_json'],
  ['public.be_subscription_packages', 'fulfillment_json'],
  ['public.be_appointment_cancellations', 'applied_policy_snapshot,notifications_sent'],
  ['public.be_appointment_reschedules', 'applied_policy_snapshot,notifications_sent'],
  ['public.be_appointment_no_shows', 'notifications_sent'],
  ['public.be_schedule_templates', 'config'],
  ['public.be_working_days', 'breaks'],
  ['public.be_working_hours', 'breaks'],
  ['integrator.user_reminder_delivery_logs', 'payload_json,error_code'],
  ['public.idempotency_keys', 'response_body'],
  ['integrator.idempotency_keys', 'response_body'],
  ['public.integrator_push_outbox', 'payload,last_error'],
  ['public.outgoing_delivery_queue', 'payload_json,last_error'],
  ['integrator.delivery_attempt_logs', 'payload_json,reason'],
]);

const allowedClassifications = new Set([
  'BOOTSTRAP',
  'SCOPED',
  'scrubbed_global',
  'INFRA_TRANSIENT',
  'LEGACY',
]);

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function parseTsv(path, text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split('\t');
  return lines.map((line, index) => {
    const cols = line.split('\t');
    if (cols.length !== headers.length) {
      throw new Error(
        `${path}:${index + 2} expected ${headers.length} columns, got ${cols.length}`,
      );
    }
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
  });
}

function loadTierMap() {
  const map = new Map();
  for (const line of read(tiersPath).trim().split(/\r?\n/)) {
    const [tier, table] = line.split('|');
    map.set(table, tier);
  }
  return map;
}

function assertNoSampleValues(rows) {
  const joined = rows.map((row) => Object.values(row).join(' ')).join('\n');
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(joined)) {
    throw new Error('artifact must not contain email samples');
  }
  if (/(?:\+?\d[\s-]?){10,}/.test(joined)) {
    throw new Error('artifact must not contain phone/id-like numeric samples');
  }
}

function runChecks(overrides = {}) {
  const rows = parseTsv(artifactPath, overrides.artifact ?? read(artifactPath));
  const tierMap = loadTierMap();

  const seen = new Set();
  for (const row of rows) {
    if (row.payload_family === 'rubitime_retry_payload') continue;
    const key = row.table;
    if (seen.has(key)) throw new Error(`duplicate table row: ${key}`);
    seen.add(key);

    const expectedColumns = expectedRows.get(key);
    if (!expectedColumns) throw new Error(`unexpected table in artifact: ${key}`);
    if (row.columns !== expectedColumns) {
      throw new Error(`${key} columns mismatch: expected ${expectedColumns}, got ${row.columns}`);
    }

    const expectedTier = tierMap.get(key);
    if (!expectedTier) throw new Error(`${key} missing from tiers-218.tsv`);
    if (row.tier !== expectedTier)
      throw new Error(`${key} tier mismatch: expected ${expectedTier}, got ${row.tier}`);
    if (!allowedClassifications.has(row.classification))
      throw new Error(`${key} invalid classification ${row.classification}`);
    if (!row.decision || row.decision.includes('TBD') || row.decision.includes('unknown')) {
      throw new Error(`${key} missing concrete decision`);
    }

    if ((row.tier === 'INFRA' || row.tier === 'TELEMETRY') && row.user_bearing === 'yes') {
      const decision = row.decision.toLowerCase();
      if (!decision.includes('retention') && !decision.includes('scrub')) {
        throw new Error(
          `${key} INFRA/TELEMETRY user-bearing payload lacks retention/scrub decision`,
        );
      }
    }
  }

  for (const table of expectedRows.keys()) {
    if (!seen.has(table)) throw new Error(`missing artifact row: ${table}`);
  }

  assertNoSampleValues(rows);
}

if (process.argv.includes('--self-test')) {
  const artifact = read(artifactPath).replace(
    'retention/scrub decision: operational retry payload remains INFRA; workers must not log raw payload/PII; dead rows require bounded retention/manual health archive path',
    'operational retry payload remains INFRA; workers must not log raw payload/PII',
  );
  try {
    runChecks({ artifact });
  } catch {
    console.log('check-p0-12-json-payloads self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect missing retention/scrub decision');
}

try {
  runChecks();
  console.log('check-p0-12-json-payloads: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-12-json-payloads: ${message}`);
  process.exit(1);
}
