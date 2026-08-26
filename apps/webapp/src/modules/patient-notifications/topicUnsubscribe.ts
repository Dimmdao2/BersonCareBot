import { createHmac, timingSafeEqual } from 'node:crypto';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { isValidNotificationTopicId, isValidNotificationTopicTitle } from './notificationsTopics';

// v2 adds the clinic context required by the tenant-scoped write door. Older links fail honestly
// instead of being accepted under the same version with a now-incompatible payload shape.
const TOKEN_VERSION = 2;
const SIGNING_PURPOSE = 'patient-notification-topic-unsubscribe';
export const PUBLIC_TOPIC_UNSUBSCRIBE_PATH = '/api/public/notifications/unsubscribe';

type TopicUnsubscribeTokenPayload = {
  v: typeof TOKEN_VERSION;
  userId: string;
  organizationId: string;
  topicCode: string;
  nonce: string;
  /** Patient-facing title at send time. Optional for previously issued signed links. */
  topicTitle?: string;
};

export type TopicUnsubscribeResult = {
  /** True only after the preference write completed. Invalid links and failed writes are indistinguishable. */
  applied: boolean;
  /** Present only after a completed write; never exposes recipient existence on failure. */
  topicCode: string | null;
  /** The human title from the signed delivery link, when present. */
  topicTitle: string | null;
};

export type TopicUnsubscribeServiceDeps = {
  getSecret: () => string;
  appBaseUrl: string;
  setTopicEnabled: (userId: string, topicCode: string, enabled: boolean) => Promise<void>;
  runForPatient: <T>(
    userId: string,
    organizationId: string,
    action: () => Promise<T>,
  ) => Promise<T>;
  onWriteFailure?: (error: unknown) => void;
};

function requireSecret(getSecret: () => string): string {
  const secret = getSecret().trim();
  if (secret.length < 16) throw new Error('topic_unsubscribe_secret_unavailable');
  return secret;
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${SIGNING_PURPOSE}.${encodedPayload}`).digest();
}

function decodeToken(token: string, secret: string): TopicUnsubscribeTokenPayload | null {
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra !== undefined) return null;

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  const expectedSignature = sign(encodedPayload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const userId = typeof candidate.userId === 'string' ? candidate.userId.trim() : '';
    const organizationId =
      typeof candidate.organizationId === 'string' ? candidate.organizationId.trim() : '';
    const topicCode = typeof candidate.topicCode === 'string' ? candidate.topicCode.trim() : '';
    const nonce = typeof candidate.nonce === 'string' ? candidate.nonce.trim() : '';
    const topicTitle = typeof candidate.topicTitle === 'string' ? candidate.topicTitle.trim() : '';
    if (
      candidate.v !== TOKEN_VERSION ||
      !isPlatformUserUuid(userId) ||
      !isPlatformUserUuid(organizationId) ||
      !isValidNotificationTopicId(topicCode) ||
      nonce.length < 8 ||
      nonce.length > 200 ||
      (topicTitle.length > 0 && !isValidNotificationTopicTitle(topicTitle))
    ) {
      return null;
    }
    return {
      v: TOKEN_VERSION,
      userId,
      organizationId,
      topicCode,
      nonce,
      ...(topicTitle ? { topicTitle } : {}),
    };
  } catch {
    return null;
  }
}

export function createTopicUnsubscribeService(deps: TopicUnsubscribeServiceDeps) {
  return {
    createUrl(input: {
      userId: string;
      organizationId: string;
      topicCode: string;
      topicTitle: string;
      nonce: string;
    }): string {
      const secret = requireSecret(deps.getSecret);
      const payload: TopicUnsubscribeTokenPayload = {
        v: TOKEN_VERSION,
        userId: input.userId.trim(),
        organizationId: input.organizationId.trim(),
        topicCode: input.topicCode.trim(),
        topicTitle: input.topicTitle.trim(),
        nonce: input.nonce.trim(),
      };
      if (
        !isPlatformUserUuid(payload.userId) ||
        !isPlatformUserUuid(payload.organizationId) ||
        !isValidNotificationTopicId(payload.topicCode) ||
        !isValidNotificationTopicTitle(payload.topicTitle ?? '') ||
        payload.nonce.length < 8 ||
        payload.nonce.length > 200
      ) {
        throw new Error('topic_unsubscribe_payload_invalid');
      }
      const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const token = `${encodedPayload}.${sign(encodedPayload, secret).toString('base64url')}`;
      const base = deps.appBaseUrl.trim().replace(/\/+$/, '');
      return `${base}${PUBLIC_TOPIC_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`;
    },

    async unsubscribeByToken(token: string): Promise<TopicUnsubscribeResult> {
      const secret = requireSecret(deps.getSecret);
      const payload = decodeToken(token.trim(), secret);
      if (!payload) return { applied: false, topicCode: null, topicTitle: null };
      try {
        await deps.runForPatient(payload.userId, payload.organizationId, () =>
          deps.setTopicEnabled(payload.userId, payload.topicCode, false),
        );
      } catch (error) {
        deps.onWriteFailure?.(error);
        // Public response must not reveal whether the signed recipient still exists, and a failed
        // write must never be presented as a completed unsubscribe.
        return { applied: false, topicCode: null, topicTitle: null };
      }
      return { applied: true, topicCode: payload.topicCode, topicTitle: payload.topicTitle ?? null };
    },
  };
}
