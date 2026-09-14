import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DbPort,
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { assertOutboundMessagePolicy } from '../../infra/adapters/outboundMessagePolicy.js';
import { registerBersoncareSendEmailRoute } from './sendEmailRoute.js';

/**
 * Reality guard for #1112 (LOGIN_HISTORY_2026-09-13.md Л-8.2б). The failure this pins is expensive
 * and silent: a declared transactional email reaching the central egress door WITHOUT a marker the
 * door recognizes is denied 403 and the notice is dropped without a trace — it already happened
 * twice and both times was noticed only by accident.
 *
 * The test binds the two files that must agree — the route's purpose→marker derivation and the
 * central matrix `assertOutboundMessagePolicy` — by running the REAL door over the intent the route
 * actually hands to the dispatch chokepoint. It asserts behavior (the door admits the intent for
 * email / the route refuses to dispatch), never fixed text, counts, or intermediate object shape.
 */

const SHARED_SECRET = 'send-email-purpose-audit-secret';
const ROUTE = '/api/bersoncare/send-email';

const apps: FastifyInstance[] = [];

const smtpOutboundValueJson = {
  value: {
    host: 'smtp.example.test',
    user: 'sender@example.test',
    password: 'super-secret-password',
    from: 'BersonCare <no-reply@example.test>',
    port: 587,
    secure: false,
  },
};

function configuredSmtpDb(): DbPort {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ value_json: smtpOutboundValueJson }] }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function protocolHeaders(rawBody: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SHARED_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': signature,
  };
}

async function buildApp(dispatchOutgoing: DispatchPort['dispatchOutgoing']): Promise<FastifyInstance> {
  const keys = new Set<string>();
  const idempotencyPort: IdempotencyPort = {
    tryAcquire: async (key) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    release: async (key) => void keys.delete(key),
  };
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareSendEmailRoute(app, {
    sharedSecret: SHARED_SECRET,
    db: configuredSmtpDb(),
    dispatchPort: { dispatchOutgoing },
    recordProviderFailure: async () => {},
    idempotencyPort,
  });
  return app;
}

async function injectSigned(app: FastifyInstance, payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  return app.inject({ method: 'POST', url: ROUTE, headers: protocolHeaders(rawBody), payload: rawBody });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

// Every purpose the door contract exposes to callers. Kept in sync by the route's own zod enum:
// an added purpose that no test lists here still has to pass `assertOutboundMessagePolicy` below.
const DECLARED_PURPOSES = [
  'new_device_login',
  'clinic_invite',
  'specialist_signup_duplicate',
  'specialist_task_reminder',
  'operator_alert_fallback',
] as const;

describe('send-email transactional purpose (central egress reality guard)', () => {
  for (const purpose of DECLARED_PURPOSES) {
    it(`derives a marker the central egress door admits for email — ${purpose}`, async () => {
      let captured: OutgoingIntent | undefined;
      const app = await buildApp(async (intent: OutgoingIntent) => {
        captured = intent;
        return {};
      });

      const response = await injectSigned(app, {
        purpose,
        to: 'staff@example.test',
        subject: 'тема',
        text: 'готовый текст письма',
        idempotencyKey: `txn:${purpose}`,
      });

      expect(response.statusCode).toBe(200);
      expect(captured).toBeDefined();
      // The real door, not a mock: if the derived marker were missing or off-matrix this throws,
      // reproducing the silent 403 drop the fix was meant to close.
      expect(assertOutboundMessagePolicy(captured as OutgoingIntent)).toBe('email');
    });
  }

  it('refuses to dispatch a transactional email with no declared purpose (absence is denial)', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp(dispatchOutgoing);

    const response = await injectSigned(app, {
      to: 'staff@example.test',
      subject: 'тема',
      text: 'готовый текст письма',
      idempotencyKey: 'txn:no-purpose',
    });

    expect(response.statusCode).toBe(400);
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('refuses to dispatch a transactional email whose purpose is outside the closed list', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp(dispatchOutgoing);

    const response = await injectSigned(app, {
      purpose: 'marketing_blast',
      to: 'staff@example.test',
      subject: 'тема',
      text: 'готовый текст письма',
      idempotencyKey: 'txn:unknown-purpose',
    });

    expect(response.statusCode).toBe(400);
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });
});
