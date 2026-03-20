/**
 * In-memory SubscriptionMailingProjectionPort for tests and no-DB environments.
 */

import type { SubscriptionMailingProjectionPort } from "./pgSubscriptionMailingProjection";

type TopicRow = {
  integratorTopicId: number;
  code: string;
  title: string;
  key: string;
  isActive: boolean;
  updatedAt: string;
};

type SubscriptionRow = {
  integratorUserId: number;
  integratorTopicId: number;
  isActive: boolean;
  updatedAt: string;
};

type MailingLogRow = {
  integratorUserId: number;
  integratorMailingId: number;
  status: string;
  sentAt: string;
  errorText: string | null;
};

const topicsByIntegratorId = new Map<number, TopicRow>();
const subscriptionKey = (userId: number, topicId: number) => `${userId}:${topicId}`;
const subscriptionsByKey = new Map<string, SubscriptionRow>();
const mailingLogKey = (userId: number, mailingId: number) => `${userId}:${mailingId}`;
const mailingLogsByKey = new Map<string, MailingLogRow>();

export const inMemorySubscriptionMailingProjectionPort: SubscriptionMailingProjectionPort = {
  async upsertTopicFromProjection(params) {
    topicsByIntegratorId.set(params.integratorTopicId, {
      integratorTopicId: params.integratorTopicId,
      code: params.code,
      title: params.title,
      key: params.key,
      isActive: params.isActive,
      updatedAt: params.updatedAt,
    });
  },

  async upsertUserSubscriptionFromProjection(params) {
    const key = subscriptionKey(params.integratorUserId, params.integratorTopicId);
    subscriptionsByKey.set(key, {
      integratorUserId: params.integratorUserId,
      integratorTopicId: params.integratorTopicId,
      isActive: params.isActive,
      updatedAt: params.updatedAt,
    });
  },

  async appendMailingLogFromProjection(params) {
    const key = mailingLogKey(params.integratorUserId, params.integratorMailingId);
    if (mailingLogsByKey.has(key)) return;
    mailingLogsByKey.set(key, {
      integratorUserId: params.integratorUserId,
      integratorMailingId: params.integratorMailingId,
      status: params.status,
      sentAt: params.sentAt,
      errorText: params.errorText,
    });
  },

  async listTopics() {
    const list: { integratorTopicId: string; code: string; title: string; key: string; isActive: boolean }[] = [];
    for (const [id, t] of topicsByIntegratorId) {
      if (t.isActive) list.push({ integratorTopicId: String(id), code: t.code, title: t.title, key: t.key, isActive: t.isActive });
    }
    list.sort((a, b) => Number(a.integratorTopicId) - Number(b.integratorTopicId));
    return list;
  },

  async listSubscriptionsByIntegratorUserId(integratorUserId: string) {
    const userIdNum = Number(integratorUserId);
    const list: { integratorTopicId: string; topicCode: string; isActive: boolean }[] = [];
    for (const [, sub] of subscriptionsByKey) {
      if (sub.integratorUserId !== userIdNum || !sub.isActive) continue;
      const topic = topicsByIntegratorId.get(sub.integratorTopicId);
      list.push({
        integratorTopicId: String(sub.integratorTopicId),
        topicCode: topic?.code ?? "",
        isActive: sub.isActive,
      });
    }
    list.sort((a, b) => Number(a.integratorTopicId) - Number(b.integratorTopicId));
    return list;
  },
};

/** Test-only: read topic by integrator topic id (for idempotency tests). */
export function _testGetTopicByIntegratorId(topicId: number): TopicRow | undefined {
  return topicsByIntegratorId.get(topicId);
}

/** Test-only: read subscription (for idempotency tests). */
export function _testGetSubscription(
  userId: number,
  topicId: number
): SubscriptionRow | undefined {
  return subscriptionsByKey.get(subscriptionKey(userId, topicId));
}

/** Test-only: read mailing log (for idempotency tests). */
export function _testGetMailingLog(
  userId: number,
  mailingId: number
): MailingLogRow | undefined {
  return mailingLogsByKey.get(mailingLogKey(userId, mailingId));
}
