#!/usr/bin/env tsx
// HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
// Kept for reproducible integrator-schema migration audits; it is not a live runtime workflow.
const HELP = `Usage:
  pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/04_disable_writers.ts

Prints owner-gated writer/read-source switches that must be disabled before destructive cleanup.
No writes are performed by this script.`;

const ACTIONS = [
  {
    domain: "system_settings",
    status: "blocked",
    requiredBeforeDrop: [
      "replace syncSettingToIntegrator/system_settings_sync with cache invalidation that does not write integrator.system_settings",
      "drain or retire public.integrator_push_outbox rows where kind='system_settings_sync'",
      "remove settingsSyncRoute mount after a release window",
    ],
  },
  {
    domain: "reminders",
    status: "blocked",
    requiredBeforeDrop: [
      "implement bot dispatch from public.reminder_rules or a typed public dispatch port",
      "move occurrence planning and delivery logging off integrator.user_reminder_*",
      "prove callback/idempotency/topic/quiet-hours parity",
    ],
  },
  {
    domain: "rubitime",
    status: "owner-decision",
    requiredBeforeDrop: [
      "set booking_slots_read_source=canonical through Settings after parity proof",
      "set booking_doctor_appointments_read_source=canonical through Settings after parity proof",
      "disable legacy v1 Rubitime profile resolve and admin writes",
      "decide whether Rubitime remains active mirror or historical archive",
    ],
  },
  {
    domain: "contacts",
    status: "blocked",
    requiredBeforeDrop: [
      "run non-PII contacts exception audit",
      "resolve public-missing/legacy-present and mismatch aggregates",
      "set integrator_linked_phone_source=public_only for a release window",
      "keep contacts_only rollback during the release window",
    ],
  },
  {
    domain: "conversations_questions",
    status: "blocked",
    requiredBeforeDrop: [
      "move integrator writePort/messageThreads writers to public support tables",
      "replace auto-close/fallback reads",
      "decide whether support_questions remains a product surface",
    ],
  },
  {
    domain: "queues_logs",
    status: "retain",
    requiredBeforeDrop: [
      "define retention windows",
      "add terminal-row purge/archive jobs",
      "do not drop live worker queue tables while workers consume them",
    ],
  },
];

if (process.argv.includes("--help")) {
  console.log(HELP);
} else {
  console.log(JSON.stringify({ mode: "dry-run", actions: ACTIONS }, null, 2));
}
