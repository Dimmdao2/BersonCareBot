import { createHmac, timingSafeEqual } from 'node:crypto';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { isValidNotificationTopicId } from './notificationsTopics';

const TOKEN_VERSION = 1;
const SIGNING_PURPOSE = 'patient-notification-topic-unsubscribe';
export const PUBLIC_TOPIC_UNSUBSCRIBE_PATH = '/api/public/notifications/unsubscribe';

type TopicUnsubscribeTokenPayload = {
  v: typeof TOKEN_VERSION;
  userId: string;
  topicCode: string;
  nonce: string;
};

export type TopicUnsubscribeServiceDeps = {
  getSecret: () => string;
  appBaseUrl: string;
  setTopicEnabled: (userId: string, topicCode: string, enabled: boolean) => Promise<void>;
  runForPatient: <T>(userId: string, action: () => Promise<T>) => Promise<T>;
};

function requireSecret(getSecret: () => string): string {
  const secret = getSecret().trim();
  if (secret.length < 16) throw new Error('topic_unsubscribe_secret_unavailable');
  return secret;
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(`${SIGNING_PURPOSE}.${encodedPayload}`)
    .digest();
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
    const topicCode = typeof candidate.topicCode === 'string' ? candidate.topicCode.trim() : '';
    const nonce = typeof candidate.nonce === 'string' ? candidate.nonce.trim() : '';
    if (
      candidate.v !== TOKEN_VERSION ||
      !isPlatformUserUuid(userId) ||
      !isValidNotificationTopicId(topicCode) ||
      nonce.length < 8 ||
      nonce.length > 200
    ) {
      return null;
    }
    return { v: TOKEN_VERSION, userId, topicCode, nonce };
  } catch {
    return null;
  }
}

export function createTopicUnsubscribeService(deps: TopicUnsubscribeServiceDeps) {
  return {
    createUrl(input: { userId: string; topicCode: string; nonce: string }): string {
      const secret = requireSecret(deps.getSecret);
      const payload: TopicUnsubscribeTokenPayload = {
        v: TOKEN_VERSION,
        userId: input.userId.trim(),
        topicCode: input.topicCode.trim(),
        nonce: input.nonce.trim(),
      };
      if (
        !isPlatformUserUuid(payload.userId) ||
        !isValidNotificationTopicId(payload.topicCode) ||
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

    async unsubscribeByToken(token: string): Promise<'applied' | 'invalid'> {
      const secret = requireSecret(deps.getSecret);
      const payload = decodeToken(token.trim(), secret);
      if (!payload) return 'invalid';
      try {
        await deps.runForPatient(payload.userId, () =>
          deps.setTopicEnabled(payload.userId, payload.topicCode, false),
        );
        return 'applied';
      } catch {
        // Public response must not reveal whether the signed recipient still exists.
        return 'invalid';
      }
    },
  };
}
