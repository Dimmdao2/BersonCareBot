import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import type { PatientReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type {
  PatientReminderMaterializationSnapshot,
  PatientReminderRuleForMaterialization,
} from '@/modules/reminders/patientReminderMaterializationPort';

const CANONICAL_REPO_ROOT = '/home/dev/dev-projects/BersonCareBot';
const CANONICAL_DATABASE = 'bcb_webapp_dev';
const CANONICAL_HOST = '127.0.0.1';
const CANONICAL_PORT = '5432';
const API_ENV_PATH = `${CANONICAL_REPO_ROOT}/.env`;
const WEBAPP_ENV_PATH = `${CANONICAL_REPO_ROOT}/apps/webapp/.env.dev`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

export function parseEnvSource(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1]!, value);
  }
  return values;
}

function assertCanonicalFile(path: string, label: string): string {
  const metadata = lstatSync(path);
  assert(metadata.isFile(), `${label} must be a file`);
  assert(!metadata.isSymbolicLink(), `${label} must not be a symlink`);
  assert.equal(realpathSync(path), path, `${label} must be canonical`);
  return readFileSync(path, 'utf8');
}

export function assertCanonicalNamedDevTarget(apiSource: string, webappSource: string): void {
  const api = parseEnvSource(apiSource);
  const webapp = parseEnvSource(webappSource);
  const targets = [
    ['INTEGRATOR_DB_URL', api.get('INTEGRATOR_DB_URL')],
    ['DATABASE_URL_STAFF', webapp.get('DATABASE_URL_STAFF')],
    ['DATABASE_URL_PATIENT', webapp.get('DATABASE_URL_PATIENT')],
    ['DATABASE_URL_GLOBAL_ADMIN', webapp.get('DATABASE_URL_GLOBAL_ADMIN')],
  ] as const;
  for (const [label, raw] of targets) {
    assert(raw, `${label} is required`);
    const parsed = new URL(raw);
    assert(
      ['postgres:', 'postgresql:'].includes(parsed.protocol),
      `${label} must be a PostgreSQL URL`,
    );
    assert.equal(parsed.hostname, CANONICAL_HOST, `${label} must target canonical named DEV host`);
    assert.equal(parsed.port, CANONICAL_PORT, `${label} must target canonical named DEV port`);
    assert.equal(
      decodeURIComponent(parsed.pathname.replace(/^\//u, '')),
      CANONICAL_DATABASE,
      `${label} must target canonical named DEV database`,
    );
  }
  assert.equal(
    api.get('DB_PRINCIPAL_CONTEXT_MODE'),
    'port-context',
    'integrator must use port-context',
  );
  assert.equal(
    webapp.get('DB_PRINCIPAL_CONTEXT_MODE'),
    'port-context',
    'webapp must use port-context',
  );
}

function installCanonicalEnv(apiSource: string, webappSource: string): void {
  for (const source of [apiSource, webappSource]) {
    for (const [key, value] of parseEnvSource(source)) process.env[key] = value;
  }
}

export function buildAtomicRollbackDeliveries(input: {
  rule: PatientReminderRuleForMaterialization;
  occurrenceId: string;
  plannedAt: string;
}): [PatientReminderReadyOutgoingDelivery, PatientReminderReadyOutgoingDelivery] {
  const eventId = `rem:${input.occurrenceId}:g0:telegram`;
  const valid: PatientReminderReadyOutgoingDelivery = {
    organizationId: input.rule.organizationId,
    eventId,
    kind: 'reminder_dispatch',
    channel: 'telegram',
    maxAttempts: 6,
    nextRetryAt: input.plannedAt,
    occurrenceId: input.occurrenceId,
    deliveryGeneration: 0,
    topicCode: input.rule.notificationTopicCode ?? 'warmup_reminders',
    externalId: 'named-dev-atomic-rollback',
    logText: 'Named DEV atomic rollback proof',
    platformUserId: input.rule.platformUserId,
    intent: {
      type: 'message.send',
      meta: {
        eventId,
        occurredAt: input.plannedAt,
        source: 'telegram',
        userId: input.rule.integratorUserId ?? undefined,
        outboundMessageClass: 'routine_product',
        outboundCapability: 'essential_delivery',
      },
      payload: {
        recipient: { chatId: 'named-dev-atomic-rollback' },
        message: { text: 'Named DEV atomic rollback proof' },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    },
  };
  const invalidEventId = `${eventId}:invalid-second-envelope`;
  return [
    valid,
    {
      ...valid,
      eventId: invalidEventId,
      intent: {
        ...valid.intent,
        meta: { ...valid.intent.meta, eventId: invalidEventId },
      },
    },
  ];
}

export function assertOccurrenceAbsent(
  snapshot: PatientReminderMaterializationSnapshot,
  occurrenceId: string,
  occurrenceKey: string,
): void {
  assert(
    snapshot.dueOccurrences.every(
      (row) => row.occurrence.id !== occurrenceId && row.draft.occurrenceKey !== occurrenceKey,
    ),
    'failed atomic commit leaked a reminder occurrence',
  );
}

export function hasPgCode(error: unknown, code: string): boolean {
  return object(error, 'PostgreSQL error').code === code;
}

export function parseRunArgs(args: string[]): string {
  assert.equal(
    args.length,
    3,
    'Usage: patient-reminder-materialization-named-dev-step.ts --run --organization-id <uuid>',
  );
  assert.equal(args[0], '--run', 'only --run mode is supported');
  assert.equal(args[1], '--organization-id', 'explicit --organization-id is required');
  const organizationId = args[2]?.trim() ?? '';
  assert(UUID_RE.test(organizationId), '--organization-id must be a UUID');
  return organizationId;
}

async function expectPgCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => hasPgCode(error, code));
}

async function runLive(organizationId: string): Promise<JsonObject> {
  const apiSource = assertCanonicalFile(API_ENV_PATH, 'canonical API env');
  const webappSource = assertCanonicalFile(WEBAPP_ENV_PATH, 'canonical webapp env');
  assertCanonicalNamedDevTarget(apiSource, webappSource);
  installCanonicalEnv(apiSource, webappSource);

  const [{ runWithDbOrganizationPrincipal }, { createPgPatientReminderMaterializationPort }, db] =
    await Promise.all([
      import('@bersoncare/db-principal'),
      import('../src/infra/repos/pgPatientReminderMaterialization'),
      import('../src/infra/db/client'),
    ]);
  const port = createPgPatientReminderMaterializationPort();
  const now = new Date();
  try {
    const snapshot = await runWithDbOrganizationPrincipal(organizationId, () =>
      port.readSnapshot(organizationId, now.toISOString()),
    );
    const rule = snapshot.rules.find(
      (candidate) => candidate.integratorUserId && candidate.notificationTopicCode,
    );
    assert(rule, 'selected organization has no active materializable reminder rule');

    const plannedAt = new Date(now.getTime() + 60 * 60_000).toISOString();
    const occurrenceId = `named-dev-atomic-${randomUUID()}`;
    const occurrenceKey = `named-dev-atomic-key-${randomUUID()}`;
    const occurrence = { id: occurrenceId, deliveryGeneration: 0, plannedAt };
    const draft = { occurrenceKey, plannedAt };
    const deliveries = buildAtomicRollbackDeliveries({
      rule,
      occurrenceId,
      plannedAt,
    });

    await runWithDbOrganizationPrincipal(organizationId, async () => {
      await expectPgCode(
        () =>
          port.materializeOccurrence(
            { ...rule, organizationId: randomUUID() },
            { occurrenceKey: `${occurrenceKey}:foreign`, plannedAt },
            { ...occurrence, id: `${occurrenceId}:foreign` },
            [],
          ),
        '42501',
      );

      const unavailablePlatformUserId = randomUUID();
      const unavailable = await port.materializeOccurrence(
        { ...rule, platformUserId: unavailablePlatformUserId },
        { occurrenceKey: `${occurrenceKey}:unavailable`, plannedAt },
        { ...occurrence, id: `${occurrenceId}:unavailable` },
        [
          {
            ...deliveries[0],
            occurrenceId: `${occurrenceId}:unavailable`,
            platformUserId: unavailablePlatformUserId,
            eventId: `rem:${occurrenceId}:unavailable:g0:telegram`,
          },
        ],
      );
      assert.equal(unavailable, 'not_actionable', 'unavailable patient was materialized');

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expectPgCode(
          () => port.materializeOccurrence(rule, draft, occurrence, deliveries),
          '22023',
        );
        const readback = await port.readSnapshot(
          organizationId,
          new Date(Date.parse(plannedAt) + 1_000).toISOString(),
        );
        assertOccurrenceAbsent(readback, occurrenceId, occurrenceKey);
      }
    });

    return {
      ok: true,
      target: CANONICAL_DATABASE,
      assertions: {
        crossTenantRejected: true,
        unavailablePatientSkipped: true,
        atomicRollbackObservedTwice: true,
        leakedOccurrences: 0,
      },
    };
  } finally {
    await db.getPool().end();
  }
}

async function main(): Promise<void> {
  const organizationId = parseRunArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runLive(organizationId)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
