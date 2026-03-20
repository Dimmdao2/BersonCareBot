import type {
  AppointmentsReadsPort,
  CommunicationReadsPort,
  DbPort,
  DbReadPort,
  DbReadQuery,
  RemindersReadsPort,
  SubscriptionMailingReadsPort,
} from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { getAdminStats } from './repos/adminStats.js';
import { getIdentityIdByResourceAndExternalId, getLinkDataByIdentity, getNotificationSettings } from './repos/channelUsers.js';
import {
  getDueReminderOccurrences,
  getEnabledReminderRules,
  getReminderOccurrencesForRuleRange,
} from './repos/reminders.js';
import {
  getActiveDraftByIdentity,
  getConversationById,
  getOpenConversationByIdentity,
  listOpenConversations,
  listUnansweredQuestions,
  getQuestionByConversationId,
} from './repos/messageThreads.js';
import { findUserByChannelId, findUserByPhone, lookupUser } from './repos/userLookup.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const stringValue = asNonEmptyString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function handleUserLookup<T = unknown>(db: DbPort, query: DbReadQuery): Promise<T> {
  const resource = asNonEmptyString(query.params.resource);
  const by = asNonEmptyString(query.params.by);
  const value = asNonEmptyString(query.params.value);

  if (!resource || !by || !value) return null as T;

  return (await lookupUser(db, resource, by, value)) as T;
}

export function createDbReadPort(input: {
  db?: DbPort;
  communicationReadsPort?: CommunicationReadsPort;
  remindersReadsPort?: RemindersReadsPort;
  appointmentsReadsPort?: AppointmentsReadsPort;
  subscriptionMailingReadsPort?: SubscriptionMailingReadsPort;
} = {}): DbReadPort {
  const db = input.db ?? createDbPort();
  const communicationReadsPort = input.communicationReadsPort;
  const remindersReadsPort = input.remindersReadsPort;
  const appointmentsReadsPort = input.appointmentsReadsPort;
  const subscriptionMailingReadsPort = input.subscriptionMailingReadsPort;
  return {
    async readDb<T = unknown>(query: DbReadQuery): Promise<T> {
      switch (query.type) {
        case 'user.lookup':
          return handleUserLookup<T>(db, query);
        case 'user.byPhone': {
          const phone = asNonEmptyString(query.params.phoneNormalized);
          if (!phone) return null as T;
          return (await findUserByPhone(db, phone)) as T;
        }
        case 'user.byChannelId': {
          const channelId = asNonEmptyString(query.params.channelId);
          if (!channelId) return null as T;
          return (await findUserByChannelId(db, channelId)) as T;
        }
        case 'user.byIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          if (!resource || !externalId) return null as T;
          return (await getLinkDataByIdentity(db, resource, externalId)) as T;
        }
        case 'draft.activeByIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          const source = asNonEmptyString(query.params.source);
          if (!resource || !externalId) return null as T;
          return (await getActiveDraftByIdentity(db, { resource, externalId, ...(source ? { source } : {}) })) as T;
        }
        case 'conversation.openByIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          const source = asNonEmptyString(query.params.source);
          if (!resource || !externalId) return null as T;
          return (await getOpenConversationByIdentity(db, { resource, externalId, ...(source ? { source } : {}) })) as T;
        }
        case 'conversation.byId': {
          const id = asNonEmptyString(query.params.id ?? query.params.conversationId);
          if (!id) return null as T;
          if (communicationReadsPort) {
            return (await communicationReadsPort.getConversationById(id)) as T;
          }
          return (await getConversationById(db, { id })) as T;
        }
        case 'conversation.listOpen': {
          const source = asNonEmptyString(query.params.source);
          const limit = asFiniteNumber(query.params.limit);
          if (communicationReadsPort) {
            return (await communicationReadsPort.listOpenConversations({
              ...(source ? { source } : {}),
              ...(limit !== null ? { limit } : {}),
            })) as T;
          }
          return (await listOpenConversations(db, { ...(source ? { source } : {}), ...(limit !== null ? { limit } : {}) })) as T;
        }
        case 'questions.unanswered': {
          const limit = asFiniteNumber(query.params.limit);
          if (communicationReadsPort) {
            return (await communicationReadsPort.listUnansweredQuestions({
              ...(limit !== null ? { limit } : {}),
            })) as T;
          }
          return (await listUnansweredQuestions(db, { ...(limit !== null ? { limit } : {}) })) as T;
        }
        case 'question.byConversationId': {
          const conversationId = asNonEmptyString(query.params.conversationId);
          if (!conversationId) return null as T;
          if (communicationReadsPort) {
            return (await communicationReadsPort.getQuestionByConversationId(conversationId)) as T;
          }
          return (await getQuestionByConversationId(db, { conversationId })) as T;
        }
        case 'identity.idByResourceAndExternalId': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          if (!resource || !externalId) return null as T;
          return (await getIdentityIdByResourceAndExternalId(db, resource, externalId)) as T;
        }
        case 'notifications.settings': {
          const resource = asNonEmptyString(query.params.resource) ?? 'telegram';
          if (resource !== 'telegram') return null as T;
          const channelUserId = asFiniteNumber(query.params.channelUserId ?? query.params.channelId);
          if (channelUserId === null) return null as T;
          return (await getNotificationSettings(db, channelUserId)) as T;
        }
        case 'booking.byExternalId': {
          const recordId = asNonEmptyString(query.params.externalRecordId ?? query.params.recordId);
          if (!recordId) return null as T;
          if (!appointmentsReadsPort) {
            throw new Error('appointments product reads require appointmentsReadsPort');
          }
          return (await appointmentsReadsPort.getRecordByExternalId(recordId)) as T;
        }
        case 'booking.activeByUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (!appointmentsReadsPort) {
            throw new Error('appointments product reads require appointmentsReadsPort');
          }
          return (await appointmentsReadsPort.getActiveRecordsByPhone(userId)) as T;
        }
        case 'stats.adminDashboard':
          return (await getAdminStats(db)) as T;
        case 'reminders.rules.forUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (!remindersReadsPort) {
            throw new Error('reminders product reads require remindersReadsPort');
          }
          return (await remindersReadsPort.listRulesForUser(userId)) as T;
        }
        case 'reminders.rule.forUserAndCategory': {
          const userId = asNonEmptyString(query.params.userId);
          const category = asNonEmptyString(query.params.category);
          if (!userId || !category) return null as T;
          if (!remindersReadsPort) {
            throw new Error('reminders product reads require remindersReadsPort');
          }
          return (await remindersReadsPort.getRuleForUserAndCategory(userId, category)) as T;
        }
        case 'reminders.rules.enabled':
          return (await getEnabledReminderRules(db)) as T;
        case 'reminders.occurrences.forRuleRange': {
          const ruleId = asNonEmptyString(query.params.ruleId);
          const fromIso = asNonEmptyString(query.params.fromIso);
          const toIso = asNonEmptyString(query.params.toIso);
          if (!ruleId || !fromIso || !toIso) return [] as T;
          return (await getReminderOccurrencesForRuleRange(db, ruleId, fromIso, toIso)) as T;
        }
        case 'reminders.occurrences.due': {
          const nowIso = asNonEmptyString(query.params.nowIso);
          const limit = asFiniteNumber(query.params.limit) ?? 50;
          if (!nowIso) return [] as T;
          return (await getDueReminderOccurrences(db, nowIso, limit)) as T;
        }
        case 'mailing.topics.list': {
          if (!subscriptionMailingReadsPort) return [] as T;
          return (await subscriptionMailingReadsPort.listTopics()) as T;
        }
        case 'subscriptions.byUser': {
          const userIdParam = asNonEmptyString(query.params.integratorUserId ?? query.params.userId);
          if (!userIdParam) return [] as T;
          if (!subscriptionMailingReadsPort) return [] as T;
          return (await subscriptionMailingReadsPort.getSubscriptionsByUserId(userIdParam)) as T;
        }
        default:
          return null as T;
      }
    },
  };
}
