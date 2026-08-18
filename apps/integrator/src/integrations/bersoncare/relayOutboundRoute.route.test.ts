import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeliveryAdapter,
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import type { RecordOperatorFailureIncidentInput } from '../../infra/operatorIncident/reportOperatorFailure.js';
import { OutboundMessagePolicyError } from '../../infra/adapters/outboundMessagePolicy.js';
import { createDefaultDispatchPort } from '../../infra/adapters/dispatchPort.js';
import { createEmailDeliveryAdapter } from '../email/deliveryAdapter.js';
import type { DbPort } from '../../kernel/contracts/index.js';
import { sendMail } from '../email/mailer.js';
import { registerBersoncareRelayOutboundRoute } from './relayOutboundRoute.js';

vi.mock('../email/mailer.js', () => ({
  sendMail: vi.fn(async (_cfg: unknown, params: { to: string | string[] }) => ({
    accepted: Array.isArray(params.to) ? params.to : [params.to],
    rejected: [] as string[],
  })),
}));

vi.mock('../../shared/devDeliveryRedirect.js', () => ({
  isDevRedirectActive: () => false,
}));

/** Simulates the store `createPostgresIdempotencyPort` backs onto: a table row, not process memory. */
function fakePersistentIdempotencyPort(): IdempotencyPort {
  const store = new Map<string, number>();
  return {
    tryAcquire: async (key: string) => {
      if (store.has(key)) return false;
      store.set(key, 1);
      return true;
    },
    release: async (key: string) => {
      store.delete(key);
    },
  };
}

const incidentRecorder = vi.hoisted(() =>
  vi.fn<
    (input: RecordOperatorFailureIncidentInput) => Promise<{ id: string; occurrenceCount: number }>
  >(),
);

vi.mock('../../infra/operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: incidentRecorder,
}));

const SHARED_SECRET = 'relay-route-test-secret';
const ROUTE = '/api/bersoncare/relay-outbound';
const ORGANIZATION_ID = '0c3c1bb2-b42f-44b7-8398-1dc766abec2d';
const PUSH_USER_ID = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';

const apps: FastifyInstance[] = [];

type RelayPayload = {
  messageId: string;
  organizationId?: string;
  channel: 'telegram' | 'max' | 'email' | 'sms' | 'web_push';
  recipient: string;
  text: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  senderScope?: 'clinic_required';
  html?: string;
  icsContent?: string;
  icsFilename?: string;
};

function relayPayload(overrides: Partial<RelayPayload> = {}): RelayPayload {
  return {
    messageId: 'message-1',
    channel: 'email',
    recipient: 'patient@example.test',
    text: 'Appointment reminder',
    idempotencyKey: 'relay-test-1',
    ...overrides,
  };
}

/**
 * Independent protocol oracle from apps/webapp/INTEGRATOR_CONTRACT.md Flow 6:
 * HMAC-SHA256(secret, timestamp + "." + rawBody), encoded as base64url.
 */
function protocolHeaders(
  rawBody: string,
  options: { timestamp?: string; signature?: string } = {},
): Record<string, string> {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature =
    options.signature ??
    createHmac('sha256', SHARED_SECRET)
      .update(timestamp)
      .update('.')
      .update(rawBody)
      .digest('base64url');
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': signature,
  };
}

async function buildApp(
  dispatchOutgoing: DispatchPort['dispatchOutgoing'],
  options: { idempotencyPort?: IdempotencyPort } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareRelayOutboundRoute(app, {
    dispatchPort: { dispatchOutgoing },
    sharedSecret: SHARED_SECRET,
    idempotencyPort: options.idempotencyPort ?? fakePersistentIdempotencyPort(),
  });
  return app;
}

async function injectSigned(app: FastifyInstance, payload: RelayPayload) {
  const rawBody = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: ROUTE,
    headers: protocolHeaders(rawBody),
    payload: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  incidentRecorder.mockResolvedValue({ id: 'incident-1', occurrenceCount: 1 });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('POST /api/bersoncare/relay-outbound', () => {
  it('preserves clinic-required sender scope for an exact organization relay', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp(dispatchOutgoing);

    const response = await injectSigned(
      app,
      relayPayload({
        organizationId: ORGANIZATION_ID,
        channel: 'telegram',
        recipient: '12345',
        senderScope: 'clinic_required',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(dispatchOutgoing).toHaveBeenCalledOnce();
    expect(
      (dispatchOutgoing.mock.calls[0]?.[0].payload as { delivery?: unknown }).delivery,
    ).toEqual({ channels: ['telegram'], senderScope: 'clinic_required' });
  });

  it('delivers an essential notification through the real dispatch policy and platform fallback', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const dispatchPort = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: async () => null,
    });
    const app = await buildApp(dispatchPort.dispatchOutgoing);

    const response = await injectSigned(
      app,
      relayPayload({
        organizationId: ORGANIZATION_ID,
        channel: 'email',
        recipient: 'patient@example.test',
        text: 'New appointment',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
  });

  it('delivers a clinic-required email broadcast through the exact clinic sender', async () => {
    const send = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const adapter: DeliveryAdapter = { canHandle: () => true, send };
    const dispatchPort = createDefaultDispatchPort({
      adapters: [adapter],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'email',
        smtp: {
          configured: true,
          smtpHost: 'smtp.clinic.test',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'clinic',
          smtpPass: 'secret',
          fromAddress: 'clinic@example.test',
        },
      }),
    });
    const app = await buildApp(dispatchPort.dispatchOutgoing);

    const response = await injectSigned(
      app,
      relayPayload({
        organizationId: ORGANIZATION_ID,
        channel: 'email',
        recipient: 'patient@example.test',
        text: 'Clinic mailing',
        senderScope: 'clinic_required',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(
      (send.mock.calls[0]?.[0].payload as { delivery?: Record<string, unknown> }).delivery,
    ).toMatchObject({ clinicCredential: { channel: 'email' } });
  });

  it('carries the booking .ics from the relay body through to the sent email attachment', async () => {
    // Regression: the schema declared neither icsContent nor icsFilename, so zod stripped both
    // and the confirmation letter promised an attachment it never carried. This walks the whole
    // chain the webapp uses — signed relay body → schema → buildIntent → dispatch → email adapter
    // → sendMail — and asserts the calendar file survives every hop.
    const icsText =
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:booking-77\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const sendMailMock = vi.mocked(sendMail);
    const dispatchPort = createDefaultDispatchPort({
      adapters: [createEmailDeliveryAdapter({ getDb: () => ({}) as DbPort })],
      resolveClinicDeliveryCredential: async () => ({
        channel: 'email',
        smtp: {
          configured: true,
          smtpHost: 'smtp.clinic.test',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'clinic',
          smtpPass: 'secret',
          fromAddress: 'clinic@example.test',
        },
      }),
    });
    const app = await buildApp(dispatchPort.dispatchOutgoing);

    const response = await injectSigned(
      app,
      relayPayload({
        organizationId: ORGANIZATION_ID,
        channel: 'email',
        recipient: 'patient@example.test',
        text: 'Файл .ics во вложении — добавьте событие в свой календарь.',
        metadata: { subject: 'Запись подтверждена' },
        icsContent: Buffer.from(icsText, 'utf-8').toString('base64'),
        icsFilename: 'bersoncare-booking-77.ics',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(sendMailMock).toHaveBeenCalledOnce();
    const attachments = sendMailMock.mock.calls[0]?.[1].attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments?.[0]).toMatchObject({
      filename: 'bersoncare-booking-77.ics',
      contentType: 'text/calendar; charset=utf-8',
    });
    expect(Buffer.from(attachments?.[0]?.content ?? '').toString('utf-8')).toBe(icsText);
  });

  it('rejects missing, invalid, and stale authentication without dispatching', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp(dispatchOutgoing);
    const rawBody = JSON.stringify(relayPayload());
    const nowSeconds = Math.floor(Date.now() / 1000);

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: ROUTE,
        headers: { 'content-type': 'application/json' },
        payload: rawBody,
      }),
      app.inject({
        method: 'POST',
        url: ROUTE,
        headers: protocolHeaders(rawBody, { signature: 'not-a-valid-signature' }),
        payload: rawBody,
      }),
      app.inject({
        method: 'POST',
        url: ROUTE,
        headers: protocolHeaders(rawBody, { timestamp: String(nowSeconds - 301) }),
        payload: rawBody,
      }),
    ]);

    expect(
      responses.map((response) => ({
        statusCode: response.statusCode,
        body: JSON.parse(response.body) as unknown,
      })),
    ).toEqual([
      { statusCode: 400, body: { ok: false, error: 'missing_headers' } },
      { statusCode: 401, body: { ok: false, error: 'invalid_signature' } },
      { statusCode: 401, body: { ok: false, error: 'invalid_signature' } },
    ]);
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('does not dispatch a concurrently in-flight duplicate twice', async () => {
    let dispatchCount = 0;
    let releaseFirst!: () => void;
    let markFirstEntered!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      markFirstEntered = resolve;
    });
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => {
      dispatchCount += 1;
      if (dispatchCount === 1) {
        markFirstEntered();
        await holdFirst;
      }
      return {};
    });
    const app = await buildApp(dispatchOutgoing);
    const payload = relayPayload({ idempotencyKey: 'concurrent-key' });

    const firstRequest = injectSigned(app, payload);
    await firstEntered;
    const duplicateResponse = await injectSigned(app, payload);
    releaseFirst();
    const firstResponse = await firstRequest;

    expect(duplicateResponse.statusCode).toBe(503);
    expect(JSON.parse(duplicateResponse.body) as unknown).toEqual({
      ok: false,
      error: 'dispatch_in_flight',
    });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse.body) as unknown).toEqual({
      ok: true,
      status: 'accepted',
    });
  });

  it('does not dispatch the same idempotency key twice across a process restart', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    // The durable store (Postgres in production) is the one thing that survives a restart —
    // a fresh app instance below has no memory of the first request beyond this shared port.
    const idempotencyPort = fakePersistentIdempotencyPort();
    const payload = relayPayload({ idempotencyKey: 'retry-after-restart-key' });

    const firstApp = await buildApp(dispatchOutgoing, { idempotencyPort });
    const firstResponse = await injectSigned(firstApp, payload);

    const secondApp = await buildApp(dispatchOutgoing, { idempotencyPort });
    const secondResponse = await injectSigned(secondApp, payload);

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse.body) as unknown).toEqual({ ok: true, status: 'accepted' });
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse.body) as unknown).toEqual({ ok: true, status: 'duplicate' });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('returns a policy denial without recording a provider incident', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => {
      throw new OutboundMessagePolicyError('missing_or_invalid_marker');
    });
    const app = await buildApp(dispatchOutgoing);

    const response = await injectSigned(app, relayPayload());

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body) as unknown).toEqual({
      ok: false,
      error: 'egress_policy_denied',
    });
    expect(incidentRecorder).not.toHaveBeenCalled();
  });

  it.each([
    {
      channel: 'email' as const,
      recipient: 'patient@example.test',
      providerError: new Error('454 Throttling failure: Daily message quota exceeded'),
      expectedIncident: {
        direction: 'outbound_delivery_provider',
        integration: 'email',
        errorClass: 'provider_quota_exhausted',
        errorDetail: null,
      },
    },
    {
      channel: 'sms' as const,
      recipient: '+79991234567',
      providerError: new Error('SMSC transport unavailable'),
      expectedIncident: {
        direction: 'outbound_delivery_provider',
        integration: 'smsc',
        errorClass: 'provider_send_failed',
        errorDetail: null,
      },
    },
  ])(
    'records the public provider classification for $channel failures',
    async ({ channel, recipient, providerError, expectedIncident }) => {
      const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => {
        throw providerError;
      });
      const app = await buildApp(dispatchOutgoing);

      const response = await injectSigned(
        app,
        relayPayload({
          channel,
          recipient,
          idempotencyKey: `provider-failure-${channel}`,
        }),
      );

      expect(response.statusCode).toBe(502);
      expect(JSON.parse(response.body) as unknown).toEqual({
        ok: false,
        error: 'dispatch_failed',
      });
      expect(incidentRecorder).toHaveBeenCalledOnce();
      expect(incidentRecorder).toHaveBeenCalledWith(expectedIncident);
    },
  );

  it('preserves the signed web-push dispatch contract', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({
      webPushOutcome: {
        status: 'success' as const,
        delivered: 1,
        errors: 0,
        deactivated: 0,
      },
    }));
    const app = await buildApp(dispatchOutgoing);
    const payload = relayPayload({
      messageId: 'push-message-1',
      organizationId: ORGANIZATION_ID,
      channel: 'web_push',
      recipient: PUSH_USER_ID,
      text: 'Your appointment starts soon',
      idempotencyKey: 'push-contract-1',
      metadata: {
        title: 'BersonCare appointment',
        url: '/app/patient/booking',
        pushExtras: { topicCode: 'appointment_reminder' },
      },
    });

    const response = await injectSigned(app, payload);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body) as unknown).toEqual({
      ok: true,
      status: 'accepted',
    });
    expect(dispatchOutgoing).toHaveBeenCalledOnce();
    expect(dispatchOutgoing).toHaveBeenCalledWith({
      type: 'message.send',
      meta: {
        eventId: 'push-message-1',
        occurredAt: expect.any(String),
        source: 'web_push',
        correlationId: 'push-contract-1',
        outboundMessageClass: 'routine_product',
        outboundCapability: 'app_push',
      },
      payload: {
        recipient: { pushUserId: PUSH_USER_ID },
        message: { text: 'Your appointment starts soon' },
        title: 'BersonCare appointment',
        url: '/app/patient/booking',
        pushExtras: { topicCode: 'appointment_reminder' },
        delivery: { channels: ['web_push'] },
      },
    });
    expect(incidentRecorder).not.toHaveBeenCalled();
  });
});
