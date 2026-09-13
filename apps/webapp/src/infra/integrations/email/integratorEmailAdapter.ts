import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import { env, integratorWebhookSecret } from '@/config/env';
import { withAuthDeliveryChannelGate } from '@/modules/auth/authDeliveryGate';
import type { MailProfileRequest } from '@/modules/auth/mailProfile';

export type PlatformEmailAudience = 'staff' | 'patient';

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
      // Служба доставки НАЗЫВАЕТ причину отказа в теле ответа, и выбрасывать её, оставив голый код
      // состояния, значит превращать разбираемый отказ в неразбираемый: «503» одинаково выглядит и
      // когда не настроен почтовый профиль, и когда не задан общий секрет — а чинятся они в разных
      // местах. Поймано живым прогоном на TEST: письмо о входе с нового устройства не уходило, и по
      // логу webapp нельзя было сказать почему.
      const failure = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const reason = typeof failure?.error === 'string' ? failure.error.trim() : '';
      return { ok: false, error: reason ? `http_${res.status}:${reason}` : `http_${res.status}` };
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
      const gated = await withAuthDeliveryChannelGate('email', () =>
        postSendEmail(
          { to, code, mailProfile: mailProfileJson, audience: 'patient' },
          emailIdempotencyKey({ to, code, mailProfile: mailProfileJson, audience: 'patient' }),
        ),
      );
      if (!gated.ok && 'reason' in gated) {
        return { ok: false, error: gated.reason };
      }
      return gated;
    },

    async sendTransactionalEmail(
      to: string,
      subject: string,
      text: string,
      audience: PlatformEmailAudience,
    ): Promise<SendEmailResult> {
      return postSendEmail({ to, subject, text, audience }, `email:send:${randomUUID()}`);
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
  return adapter.sendTransactionalEmail(to, subject, text, 'staff');
}
