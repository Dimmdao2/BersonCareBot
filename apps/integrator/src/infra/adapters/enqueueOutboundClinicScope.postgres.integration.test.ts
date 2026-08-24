import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));

import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';
import { createDefaultDispatchPort } from './dispatchPort.js';

const ENABLED = process.env.RUN_ENQUEUE_CLINIC_SCOPE_DB === '1';
const DATABASE = process.env.ENQUEUE_CLINIC_SCOPE_DB ?? 'bcb_webapp_dev';
const MIGRATION = fileURLToPath(
  new URL(
    '../../../../webapp/db/drizzle-migrations/20260824T010511_preserve_conditional_clinic_sender_scope.sql',
    import.meta.url,
  ),
);
const ORG_ID = 'b7f4d2a1-9c60-4e31-8a55-2f0d6c91e784';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(DATABASE)) {
  throw new Error(`unsafe database identifier '${DATABASE}'`);
}

function queuedIntentFromCandidateMigration(): OutgoingIntent {
  const migration = readFileSync(MIGRATION, 'utf8');
  const sql = String.raw`
BEGIN;
GRANT CREATE ON SCHEMA app TO app_seam_delivery_scope_owner;
GRANT USAGE ON LANGUAGE plpgsql TO app_seam_delivery_scope_owner;
SET LOCAL ROLE app_seam_delivery_scope_owner;
${migration}
RESET ROLE;

CREATE OR REPLACE FUNCTION app.require_accepted_context(
  p_effective_role name,
  p_target_role name,
  p_context_class app.port_context_class,
  p_purpose text,
  p_typed_args_hash bytea,
  p_function_identity regprocedure
) RETURNS boolean LANGUAGE sql STABLE AS $stub$ SELECT true $stub$;

CREATE TEMP TABLE f1_probe AS
SELECT enrollment.organization_id,
       'f1-clinic-scope-' || pg_backend_pid()::text AS idempotency_key
FROM public.org_enrollments AS enrollment
WHERE enrollment.status = 'active'
ORDER BY enrollment.created_at DESC
LIMIT 1;

DO $probe$
DECLARE fixture f1_probe%ROWTYPE;
BEGIN
  SELECT * INTO fixture FROM f1_probe;
  IF fixture.organization_id IS NULL THEN
    RAISE EXCEPTION 'named DEV needs one active organization enrollment for F-1 proof';
  END IF;
  IF NOT app.enqueue_outbound_message(
    fixture.organization_id,
    'booking.confirmation',
    fixture.idempotency_key,
    'telegram',
    '778899001',
    '{"text":"Запись подтверждена","senderScope":"clinic_if_configured"}',
    6
  ) THEN
    RAISE EXCEPTION 'F-1 probe row was not enqueued';
  END IF;
END
$probe$;

SELECT queue.payload_json -> 'intent'
FROM public.outgoing_delivery_queue AS queue
JOIN f1_probe AS probe
  ON queue.event_id = 'booking.confirmation:' || probe.idempotency_key;
ROLLBACK;
`;

  const output = execFileSync(
    'sudo',
    [
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
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ).trim();

  return JSON.parse(output) as OutgoingIntent;
}

const describeDb = ENABLED ? describe : describe.skip;

describeDb('SQL queue sender scope reaches the real dispatch policy', () => {
  it('keeps the platform path without a clinic bot and forbids fallback after a clinic bot fails', async () => {
    const intent = queuedIntentFromCandidateMigration();
    expect((intent.payload as { delivery?: { senderScope?: string } }).delivery?.senderScope).toBe(
      'clinic_if_configured',
    );

    const platformSend = vi.fn(async (_candidate: OutgoingIntent) => ({}));
    const platformDispatch = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send: platformSend }],
      resolveClinicDeliveryCredential: async () => null,
    });
    await runWithOrganizationPrincipal(ORG_ID, () => platformDispatch.dispatchOutgoing(intent));
    expect(platformSend).toHaveBeenCalledOnce();
    expect(
      (platformSend.mock.calls[0]?.[0].payload as { delivery?: Record<string, unknown> }).delivery,
    ).not.toHaveProperty('clinicCredential');

    const clinicSend = vi.fn(async (candidate: OutgoingIntent) => {
      const delivery = (candidate.payload as { delivery?: Record<string, unknown> }).delivery;
      if (delivery && 'clinicCredential' in delivery) throw new Error('CLINIC_BOT_REJECTED');
      return {};
    });
    const clinicDispatch = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send: clinicSend }],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'telegram' as const,
        botToken: 'f1-clinic-bot-token',
      }),
    });

    await expect(
      runWithOrganizationPrincipal(ORG_ID, () => clinicDispatch.dispatchOutgoing(intent)),
    ).rejects.toThrow('CLINIC_BOT_REJECTED');
    expect(clinicSend).toHaveBeenCalledOnce();
  });
});
