import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import { env, integratorWebhookSecret } from '@/config/env';
import type { MailProfileRequest } from '@/modules/auth/mailProfile';

type SendEmailResult = { ok: true } | { ok: false; error: string };

export type IntegratorEmailAdapterDeps = {
  integratorBaseUrl: string;
  sharedSecret: string;
  fetchImpl?: typeof fetch;
};

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function emailIdempotencyKey(payload: Record<string, string>): string {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `email:send:${digest}`;
}

export function createIntegratorEmailAdapter(deps: IntegratorEmailAdapterDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.integratorBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/bersoncare/send-email`;

  async function postSendEmail(
    payload: Record<string, string>,
    idempotencyKey: string,
  ): Promise<SendEmailResult> {
    if (!deps.integratorBaseUrl || !deps.sharedSecret) {
      return { ok: false, error: 'integrator_not_configured' };
    }

    const body = JSON.stringify({ ...payload, idempotencyKey });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(timestamp, body, deps.sharedSecret);

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bersoncare-Timestamp': timestamp,
          'X-Bersoncare-Signature': signature,
          ...getCurrentCorrelationIdHeader(),
        },
        body,
      });
    } catch {
      return { ok: false, error: 'network_error' };
    }
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!data.ok) {
      return { ok: false, error: data.error ?? 'integrator_send_failed' };
    }
    return { ok: true };
  }

  return {
    async sendEmailCode(
      to: string,
      code: string,
      mailProfile: MailProfileRequest,
    ): Promise<SendEmailResult> {
      const mailProfileJson = JSON.stringify(mailProfile);
      return postSendEmail(
        { to, code, mailProfile: mailProfileJson },
        emailIdempotencyKey({ to, code, mailProfile: mailProfileJson }),
      );
    },

    async sendTransactionalEmail(
      to: string,
      subject: string,
      text: string,
    ): Promise<SendEmailResult> {
      return postSendEmail({ to, subject, text }, `email:send:${randomUUID()}`);
    },
  };
}

export async function sendEmailCodeViaIntegrator(
  to: string,
  code: string,
  mailProfile: MailProfileRequest,
): Promise<SendEmailResult> {
  const adapter = createIntegratorEmailAdapter({
    integratorBaseUrl: env.INTEGRATOR_API_URL,
    sharedSecret: integratorWebhookSecret(),
  });
  return adapter.sendEmailCode(to, code, mailProfile);
}

export async function sendEmailSetupLinkViaIntegrator(
  to: string,
  subject: string,
  text: string,
): Promise<SendEmailResult> {
  const adapter = createIntegratorEmailAdapter({
    integratorBaseUrl: env.INTEGRATOR_API_URL,
    sharedSecret: integratorWebhookSecret(),
  });
  return adapter.sendTransactionalEmail(to, subject, text);
}
