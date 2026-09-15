/**
 * Live DEV regression proof for MIGRATION_TRUTH_AND_DEAD_ALERTING M-2/M-3.
 *
 * WHAT BREAKS:
 * - M-2: the critical dispatcher reads `operator_health_alert_sent` directly under the real
 *   application principal and dies with 42501 before the provider boundary; after a successful
 *   delivery the same key must be suppressed inside the dedup window.
 * - M-3: a recipient who blocked the bot is ordinary per-recipient channel state, not a platform
 *   outage; a real provider-final queue row is an outage signal. The blocked row must remain
 *   observable through `blockedRecipientTotal`.
 *
 * ORACLE: owner requirements M-2/M-3 in
 * `docs/_TODO/MIGRATION_TRUTH_AND_DEAD_ALERTING_2026-09-15.md`, prompted by the reproduced PROD
 * incidents. The database repository is real; only the external delivery provider is replaced.
 * Queue setup is committed briefly to the named DEV so the real application login can observe it,
 * then every row is deleted in `finally`/`afterAll`.
 *
 * Run with the canonical DEV env loaded:
 *   set -a; . /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
 *   USE_REAL_DATABASE=1 RUN_OPERATOR_ALERTING_TRUTH_DB=1 \
 *     pnpm --dir apps/webapp exec vitest run \
 *       src/modules/operator-alerts/operatorAlertingTruth.devDbProof.test.ts
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled =
  process.env.USE_REAL_DATABASE === '1' &&
  process.env.RUN_OPERATOR_ALERTING_TRUTH_DB === '1';

const relayCalls: string[] = [];

vi.mock('@/infra/logging/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: vi.fn(async () => ''),
}));
vi.mock('./emptyAudienceRuntime', () => ({
  reportEmptyAudience: vi.fn(async () => undefined),
}));
vi.mock('./relayOperatorAlert', () => ({
  relayOperatorAlert: vi.fn(async (input: { messageId: string }) => {
    relayCalls.push(input.messageId);
    return { ok: true, status: 'accepted' as const };
  }),
}));

const createdEventIds = new Set<string>();

function runDevAdminSql(sql: string, variables: Record<string, string> = {}): string {
  const args = [
    '-n',
    '-u',
    'postgres',
    'psql',
    '-X',
    '-A',
    '-t',
    '-q',
    '-h',
    '/var/run/postgresql',
    '-p',
    '5432',
    '-d',
    'bcb_webapp_dev',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`);
  return execFileSync('sudo', args, { encoding: 'utf8', input: `${sql};\n` }).trim();
}

function insertDeadQueueRow(failureClass: string, lastError: string): string {
  const eventId = `dev-proof:${randomUUID()}`;
  runDevAdminSql(
    `INSERT INTO public.outgoing_delivery_queue
       (event_id, kind, channel, payload_json, status, attempt_count, max_attempts,
        next_retry_at, dead_at, last_error, failure_class, updated_at)
     VALUES
       (:'event_id', 'operator_alert', 'telegram', '{}'::jsonb, 'dead', 1, 1,
        now(), now(), :'last_error', :'failure_class', now())`,
    { event_id: eventId, last_error: lastError, failure_class: failureClass },
  );
  createdEventIds.add(eventId);
  return eventId;
}

function deleteQueueRow(eventId: string): void {
  runDevAdminSql('DELETE FROM public.outgoing_delivery_queue WHERE event_id = :\'event_id\'', {
    event_id: eventId,
  });
  createdEventIds.delete(eventId);
}

function deleteDedupRow(dedupKey: string): void {
  runDevAdminSql('DELETE FROM public.operator_health_alert_sent WHERE dedup_key = :\'dedup_key\'', {
    dedup_key: dedupKey,
  });
}

describe.skipIf(!enabled)('operator alert truth against named DEV', () => {
  let dispatchOperatorAlert: typeof import('./dispatchOperatorAlert').dispatchOperatorAlert;
  let pgOperatorHealthAlertSentPort: typeof import(
    '@/infra/repos/pgOperatorHealthAlertSent'
  ).pgOperatorHealthAlertSentPort;
  let pgOperatorHealthReadPort: typeof import(
    '@/infra/repos/pgOperatorHealthRead'
  ).pgOperatorHealthReadPort;
  let classifyCriticalHealthSignals: typeof import(
    '@/modules/operator-health/criticalHealthSignals'
  ).classifyCriticalHealthSignals;
  let runWithDbInfraPrincipal: typeof import(
    '@bersoncare/db-principal'
  ).runWithDbInfraPrincipal;
  let registerOperatorAlertDedupPort: typeof import(
    './operatorAlertRuntime'
  ).registerOperatorAlertDedupPort;
  let registerAdminNotificationTargetsPort: typeof import(
    './adminNotificationTargetsRuntime'
  ).registerAdminNotificationTargetsPort;

  beforeAll(async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'port-context';
    ({ runWithDbInfraPrincipal } = await import('@bersoncare/db-principal'));
    ({ pgOperatorHealthAlertSentPort } = await import('@/infra/repos/pgOperatorHealthAlertSent'));
    ({ pgOperatorHealthReadPort } = await import('@/infra/repos/pgOperatorHealthRead'));
    ({ classifyCriticalHealthSignals } = await import(
      '@/modules/operator-health/criticalHealthSignals'
    ));
    ({ dispatchOperatorAlert } = await import('./dispatchOperatorAlert'));
    ({ registerOperatorAlertDedupPort } = await import('./operatorAlertRuntime'));
    ({ registerAdminNotificationTargetsPort } = await import(
      './adminNotificationTargetsRuntime'
    ));

    registerOperatorAlertDedupPort(pgOperatorHealthAlertSentPort);
    registerAdminNotificationTargetsPort({
      loadTargets: async () => ({
        telegram: [],
        max: [],
        sms: [],
        email: ['operator-dev-proof@example.test'],
      }),
    });
  });

  afterAll(() => {
    for (const eventId of createdEventIds) deleteQueueRow(eventId);
  });

  it('delivers the first critical signal through the real application principal and suppresses its repeat', async () => {
    relayCalls.length = 0;
    const dedupKey = `critical:dev-proof:${randomUUID()}`;
    deleteDedupRow(dedupKey);

    try {
      const first = await runWithDbInfraPrincipal(
        { source: 'api/internal/operator-health-critical/tick:POST' },
        () =>
          dispatchOperatorAlert({
            block: 'critical',
            topic: 'outbound_delivery_provider',
            dedupKey,
            lines: ['Provider delivery failed'],
          }),
      );
      const second = await runWithDbInfraPrincipal(
        { source: 'api/internal/operator-health-critical/tick:POST' },
        () =>
          dispatchOperatorAlert({
            block: 'critical',
            topic: 'outbound_delivery_provider',
            dedupKey,
            lines: ['Provider delivery failed'],
          }),
      );

      expect(first).toMatchObject({ dispatched: true });
      expect(second).toEqual({ dispatched: false, reason: 'dedup' });
      expect(relayCalls).toHaveLength(1);
    } finally {
      deleteDedupRow(dedupKey);
    }
  });

  it('keeps blocked recipients visible without raising provider health, while a provider failure raises it', async () => {
    const readQueueHealth = () =>
      runWithDbInfraPrincipal(
        { source: 'api/internal/operator-health-critical/tick:POST' },
        () => pgOperatorHealthReadPort.getOutgoingDeliveryQueueHealth(),
      );
    const baseline = await readQueueHealth();

    const blockedId = insertDeadQueueRow(
      'recipient_blocked_bot',
      'RECIPIENT_BLOCKED_BOT: Forbidden: bot was blocked by the user',
    );
    const withBlocked = await readQueueHealth();
    deleteQueueRow(blockedId);

    expect(withBlocked.blockedRecipientTotal - baseline.blockedRecipientTotal).toBe(1);
    const blockedSignals = classifyCriticalHealthSignals({
      webappDb: 'up',
      integratorApi: 'ok',
      outgoingDelivery: {
        deadTotal: withBlocked.deadTotal - baseline.deadTotal,
        deadRecent: withBlocked.deadRecent - baseline.deadRecent,
        dueBacklog: 0,
      },
      backupJobs: {},
      probeConsecutiveFailRuns: 0,
      videoTranscodeStatus: 'ok',
    });
    expect(blockedSignals.some((candidate) => candidate.topic === 'outbound_delivery_provider')).toBe(
      false,
    );

    const providerBaseline = await readQueueHealth();
    const providerFailureId = insertDeadQueueRow(
      'provider_auth_rejected',
      '401: provider rejected application credentials',
    );
    try {
      const withProviderFailure = await readQueueHealth();
      const providerSignals = classifyCriticalHealthSignals({
        webappDb: 'up',
        integratorApi: 'ok',
        outgoingDelivery: {
          deadTotal: withProviderFailure.deadTotal - providerBaseline.deadTotal,
          deadRecent: withProviderFailure.deadRecent - providerBaseline.deadRecent,
          dueBacklog: 0,
        },
        backupJobs: {},
        probeConsecutiveFailRuns: 0,
        videoTranscodeStatus: 'ok',
      });
      expect(
        providerSignals.some((candidate) => candidate.topic === 'outbound_delivery_provider'),
      ).toBe(true);
    } finally {
      deleteQueueRow(providerFailureId);
    }
  });
});
