/**
 * Executes signed integrator-to-webapp operations.
 */
import { createHash, createHmac } from 'node:crypto';
import { integratorWebhookSecret } from '../../config/env.js';
import type { WebappEventBody, WebappEventsPort } from '../../kernel/contracts/index.js';
import { logger } from '../observability/logger.js';
import { buildIntegratorEventsHttpBody } from './jsonStableStringify.js';

type ParsedCanonicalWrite = {
  organizationId: string;
  conversationId?: string;
  questionId?: string;
  questionMessageId?: string;
  deliveryAttemptId?: string;
};

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

function hasNonLatin1Chars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return true;
  }
  return false;
}

/**
 * HTTP headers are limited to ByteString/Latin-1.
 * Keep idempotency deterministic while guaranteeing header-safe bytes.
 */
function normalizeIdempotencyKeyForHeader(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    hasNonLatin1Chars(trimmed)
  ) {
    return `idem-${createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 48)}`;
  }
  return trimmed;
}

export function createWebappEventsPort(deps: {
  getAppBaseUrl: () => Promise<string>;
}): WebappEventsPort {
  const secret = integratorWebhookSecret();

  async function postSignedJson(input: {
    path: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{
    ok: boolean;
    status: number;
    error?: string;
    canonicalWrite?: ParsedCanonicalWrite;
  }> {
    const baseUrl = await deps.getAppBaseUrl();
    if (!baseUrl || !secret) {
      return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
    }
    const url = `${baseUrl.replace(/\/$/, '')}${input.path}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, input.body, secret);
    const headerIdempotencyKey = normalizeIdempotencyKeyForHeader(input.idempotencyKey);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Bersoncare-Timestamp': timestamp,
      'X-Bersoncare-Signature': signature,
      'X-Bersoncare-Idempotency-Key': headerIdempotencyKey,
    };
    try {
      const res = await fetch(url, { method: 'POST', headers, body: input.body });
      const text = await res.text().catch(() => '');
      let parsed: {
        ok?: boolean;
        error?: string;
        canonicalWrite?: {
          conversationId?: unknown;
          organizationId?: unknown;
          questionId?: unknown;
          questionMessageId?: unknown;
          deliveryAttemptId?: unknown;
        };
      } = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as { ok?: boolean; error?: string };
        } catch {
          /* non-JSON */
        }
      }
      const ok = (res.status === 200 || res.status === 202) && parsed.ok === true;
      const organizationId =
        typeof parsed.canonicalWrite?.organizationId === 'string'
          ? parsed.canonicalWrite.organizationId.trim()
          : '';
      const readCanonicalString = (value: unknown): string | undefined =>
        typeof value === 'string' && value.trim() ? value.trim() : undefined;
      const conversationId = readCanonicalString(parsed.canonicalWrite?.conversationId);
      const questionId = readCanonicalString(parsed.canonicalWrite?.questionId);
      const questionMessageId = readCanonicalString(parsed.canonicalWrite?.questionMessageId);
      const deliveryAttemptId = readCanonicalString(parsed.canonicalWrite?.deliveryAttemptId);
      const canonicalWrite =
        ok && organizationId && (conversationId || questionId || deliveryAttemptId)
          ? {
              organizationId,
              ...(conversationId ? { conversationId } : {}),
              ...(questionId ? { questionId } : {}),
              ...(questionMessageId ? { questionMessageId } : {}),
              ...(deliveryAttemptId ? { deliveryAttemptId } : {}),
            }
          : undefined;
      return {
        ok,
        status: res.status,
        ...(canonicalWrite ? { canonicalWrite } : {}),
        ...(ok
          ? {}
          : { error: typeof parsed.error === 'string' ? parsed.error : text || res.statusText }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, error: message };
    }
  }

  return {
    async wakeOperatorHealthDigest(input: { wakeId: string }) {
      return postSignedJson({
        path: '/api/integrator/operator-health/digest-wake',
        body: JSON.stringify(input),
        idempotencyKey: `operator-health-digest-wake:${input.wakeId}`,
      });
    },

    async wakeSystemHealthGuard(input: { wakeId: string }) {
      return postSignedJson({
        path: '/api/integrator/system-health/guard-wake',
        body: JSON.stringify(input),
        idempotencyKey: `system-health-guard-wake:${input.wakeId}`,
      });
    },

    async wakePatientReminderMaterialization(input: { wakeId: string; organizationId: string }) {
      return postSignedJson({
        path: '/api/integrator/patient-reminders/materialize-wake',
        body: JSON.stringify(input),
        idempotencyKey: `patient-reminder-materialize:${input.organizationId}:${input.wakeId}`,
      });
    },

    async emit(event: WebappEventBody): Promise<{ ok: boolean; status: number; error?: string }> {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/events`;
      const fallbackBody = buildIntegratorEventsHttpBody(event);
      const rawIdempotencyKey =
        event.idempotencyKey ??
        `evt-fallback:${event.eventType}:${createHash('sha256').update(fallbackBody).digest('hex').slice(0, 24)}`;
      const idempotencyKey = normalizeIdempotencyKeyForHeader(rawIdempotencyKey);
      const body = buildIntegratorEventsHttpBody({ ...event, idempotencyKey });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        'X-Bersoncare-Idempotency-Key': idempotencyKey,
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
        });
        const text = await res.text().catch(() => '');
        let parsed: { ok?: boolean; error?: string } = {};
        let jsonParsed = false;
        if (text) {
          try {
            parsed = JSON.parse(text) as { ok?: boolean; error?: string };
            jsonParsed = true;
          } catch {
            logger.warn(
              {
                metric: 'integrator_emit_body_reject',
                eventType: event.eventType,
                httpStatus: res.status,
                bodySnippet: text.slice(0, 500),
              },
              'webapp events emit: response body is not valid JSON',
            );
          }
        }
        const ok = (res.status === 200 || res.status === 202) && parsed.ok === true;
        if (!ok && (res.status === 200 || res.status === 202)) {
          if (jsonParsed) {
            logger.warn(
              {
                metric: 'integrator_emit_body_reject',
                eventType: event.eventType,
                httpStatus: res.status,
                ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
              },
              'webapp events emit: response ok is not true',
            );
          } else if (!text) {
            logger.warn(
              {
                metric: 'integrator_emit_body_reject',
                eventType: event.eventType,
                httpStatus: res.status,
              },
              'webapp events emit: empty response body',
            );
          }
        }
        return {
          ok,
          status: res.status,
          ...(ok
            ? {}
            : { error: typeof parsed.error === 'string' ? parsed.error : text || res.statusText }),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, error: message };
      }
    },

    async syncSupportUserMessage(input: { body: string; idempotencyKey: string }): Promise<{
      ok: boolean;
      status: number;
      error?: string;
      canonicalWrite?: { conversationId: string; organizationId: string };
    }> {
      const result = await postSignedJson({
        path: '/api/integrator/support/sync-user-message',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      const canonicalWrite =
        result.canonicalWrite?.conversationId && result.canonicalWrite.organizationId
          ? {
              conversationId: result.canonicalWrite.conversationId,
              organizationId: result.canonicalWrite.organizationId,
            }
          : undefined;
      const baseResult = {
        ok: result.ok,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      };
      return { ...baseResult, ...(canonicalWrite ? { canonicalWrite } : {}) };
    },

    async setSupportStatus(input: { body: string; idempotencyKey: string }): Promise<{
      ok: boolean;
      status: number;
      error?: string;
      canonicalWrite?: { conversationId: string; organizationId: string };
    }> {
      const result = await postSignedJson({
        path: '/api/integrator/support/status',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      const canonicalWrite =
        result.canonicalWrite?.conversationId && result.canonicalWrite.organizationId
          ? {
              conversationId: result.canonicalWrite.conversationId,
              organizationId: result.canonicalWrite.organizationId,
            }
          : undefined;
      const baseResult = {
        ok: result.ok,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      };
      return { ...baseResult, ...(canonicalWrite ? { canonicalWrite } : {}) };
    },

    async syncSupportQuestionWrite(input: { body: string; idempotencyKey: string }) {
      const result = await postSignedJson({
        path: '/api/integrator/support/question',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      const canonicalWrite =
        result.canonicalWrite?.questionId && result.canonicalWrite.organizationId
          ? {
              questionId: result.canonicalWrite.questionId,
              ...(result.canonicalWrite.questionMessageId
                ? { questionMessageId: result.canonicalWrite.questionMessageId }
                : {}),
              organizationId: result.canonicalWrite.organizationId,
            }
          : undefined;
      const baseResult = {
        ok: result.ok,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      };
      return { ...baseResult, ...(canonicalWrite ? { canonicalWrite } : {}) };
    },

    async syncSupportDeliveryAttempt(input: { body: string; idempotencyKey: string }) {
      const result = await postSignedJson({
        path: '/api/integrator/support/delivery-attempt',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      const canonicalWrite =
        result.canonicalWrite?.deliveryAttemptId && result.canonicalWrite.organizationId
          ? {
              deliveryAttemptId: result.canonicalWrite.deliveryAttemptId,
              organizationId: result.canonicalWrite.organizationId,
            }
          : undefined;
      const baseResult = {
        ok: result.ok,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      };
      return { ...baseResult, ...(canonicalWrite ? { canonicalWrite } : {}) };
    },

    async applySupportAdminReply(input: {
      body: string;
      idempotencyKey: string;
    }): Promise<{ ok: boolean; status: number; error?: string }> {
      return postSignedJson({
        path: '/api/integrator/support/admin-reply',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
    },

    async beginProgramNoteReply(input: { stageItemId: string; idempotencyKey: string }): Promise<{
      ok: boolean;
      status: number;
      error?: string;
      programNoteReplyState?: string;
    }> {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({ stageItemId: input.stageItemId });
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/program-note/reply-begin`;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const headerIdempotencyKey = normalizeIdempotencyKeyForHeader(input.idempotencyKey);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        'X-Bersoncare-Idempotency-Key': headerIdempotencyKey,
      };
      try {
        const res = await fetch(url, { method: 'POST', headers, body });
        const text = await res.text().catch(() => '');
        let parsed: { ok?: boolean; error?: string; programNoteReplyState?: string } = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as typeof parsed;
          } catch {
            /* non-JSON */
          }
        }
        const ok = res.status === 200 && parsed.ok === true;
        return {
          ok,
          status: res.status,
          ...(ok && typeof parsed.programNoteReplyState === 'string'
            ? { programNoteReplyState: parsed.programNoteReplyState }
            : {}),
          ...(ok
            ? {}
            : { error: typeof parsed.error === 'string' ? parsed.error : text || res.statusText }),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, error: message };
      }
    },

    async notifyPatientWebPush(input: { body: string; idempotencyKey: string }): Promise<{
      ok: boolean;
      status: number;
      error?: string;
      skipped?: string;
      webPushDelivered?: number;
    }> {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/patient-notifications/web-push`;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, input.body, secret);
      const headerIdempotencyKey = normalizeIdempotencyKeyForHeader(input.idempotencyKey);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        'X-Bersoncare-Idempotency-Key': headerIdempotencyKey,
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: input.body,
        });
        const text = await res.text().catch(() => '');
        let parsed: Record<string, unknown> = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as Record<string, unknown>;
          } catch {
            /* non-JSON */
          }
        }
        const ok = res.status === 200 && parsed.ok === true;
        if (!ok) {
          return {
            ok: false,
            status: res.status,
            error: typeof parsed.error === 'string' ? parsed.error : text || res.statusText,
          };
        }
        const success: {
          ok: true;
          status: number;
          webPushDelivered?: number;
          skipped?: string;
        } = { ok: true, status: res.status };
        if (typeof parsed.webPushDelivered === 'number') {
          success.webPushDelivered = parsed.webPushDelivered;
        }
        if (typeof parsed.skipped === 'string') {
          success.skipped = parsed.skipped;
        }
        return success;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, error: message };
      }
    },

    async materializeAppointmentReminders(input: { body: string; idempotencyKey: string }) {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/appointment-reminders/materialize`;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, input.body, secret);
      const headers = {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        'X-Bersoncare-Idempotency-Key': normalizeIdempotencyKeyForHeader(input.idempotencyKey),
      };
      try {
        const res = await fetch(url, { method: 'POST', headers, body: input.body });
        const text = await res.text().catch(() => '');
        let parsed: Record<string, unknown> = {};
        if (text) {
          try {
            parsed = JSON.parse(text) as Record<string, unknown>;
          } catch {
            /* non-JSON */
          }
        }
        const ok = res.status === 200 && parsed.ok === true;
        return {
          ok,
          status: res.status,
          ...(typeof parsed.current === 'boolean' ? { current: parsed.current } : {}),
          ...(typeof parsed.inserted === 'number' ? { inserted: parsed.inserted } : {}),
          ...(ok
            ? {}
            : { error: typeof parsed.error === 'string' ? parsed.error : text || res.statusText }),
        };
      } catch (err) {
        return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async completeChannelLink(params: {
      linkToken: string;
      channelCode: string;
      externalId: string;
    }): Promise<{ ok: boolean; error?: string; needsPhone?: boolean }> {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        linkToken: params.linkToken,
        channelCode: params.channelCode,
        externalId: params.externalId,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/channel-link/complete`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bersoncare-Timestamp': timestamp,
            'X-Bersoncare-Signature': signature,
          },
          body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          mergeReason?: string;
          needsPhone?: boolean;
          phoneNormalized?: string;
          status?: string;
        };
        if (!res.ok) {
          const mergeReason =
            typeof data.mergeReason === 'string' && data.mergeReason.trim().length > 0
              ? data.mergeReason.trim()
              : undefined;
          const err =
            typeof data.error === 'string' && data.error.trim().length > 0
              ? data.error.trim()
              : undefined;
          /* Prefer server mergeReason on 409 so executor can map channel-link codes to user-facing templates. */
          return { ok: false, error: mergeReason ?? err ?? res.statusText };
        }
        if (data.ok !== true) {
          return { ok: false, error: data.error ?? 'channel link rejected' };
        }
        const phoneNorm =
          typeof data.phoneNormalized === 'string' && data.phoneNormalized.trim().length > 0
            ? data.phoneNormalized.trim()
            : undefined;
        return {
          ok: true,
          needsPhone: data.needsPhone === true,
          ...(phoneNorm ? { phoneNormalized: phoneNorm } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },

    async completePhoneMessengerBind(params: {
      setupToken: string;
      channelCode: string;
      externalId: string;
      phoneNormalized: string;
    }): Promise<{
      ok: boolean;
      error?: string;
      purpose?: 'login' | 'profile_bind';
      otpCode?: string;
      accountCreated?: boolean;
      challengeId?: string;
      status?: string;
      replay?: boolean;
    }> {
      const baseUrl = await deps.getAppBaseUrl();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        setupToken: params.setupToken,
        channelCode: params.channelCode,
        externalId: params.externalId,
        phoneNormalized: params.phoneNormalized,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/phone-messenger-bind/complete`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bersoncare-Timestamp': timestamp,
            'X-Bersoncare-Signature': signature,
          },
          body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          mergeReason?: string;
          purpose?: 'login' | 'profile_bind';
          otpCode?: string;
          accountCreated?: boolean;
          challengeId?: string;
          status?: string;
          replay?: boolean;
        };
        if (!res.ok) {
          const err =
            typeof data.error === 'string' && data.error.trim().length > 0
              ? data.error.trim()
              : res.statusText;
          return {
            ok: false,
            error: typeof data.mergeReason === 'string' ? data.mergeReason : err,
          };
        }
        if (data.ok !== true) {
          return { ok: false, error: data.error ?? 'phone messenger bind rejected' };
        }
        return {
          ok: true,
          ...(data.purpose === 'login' || data.purpose === 'profile_bind'
            ? { purpose: data.purpose }
            : {}),
          ...(typeof data.otpCode === 'string' ? { otpCode: data.otpCode } : {}),
          ...(data.accountCreated === true ? { accountCreated: true } : {}),
          ...(typeof data.challengeId === 'string' ? { challengeId: data.challengeId } : {}),
          ...(typeof data.status === 'string' ? { status: data.status } : {}),
          ...(data.replay === true ? { replay: true } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };
}
