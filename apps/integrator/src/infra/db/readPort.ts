import type {
  AppointmentsReadsPort,
  DbPort,
  DbReadPort,
  DbReadQuery,
  RemindersReadsPort,
} from '../../kernel/contracts/index.js';
import { createDbPort } from './client.js';
import { getAdminStats } from './repos/adminStats.js';
import {
  getChannelIdsByUserId,
  getIdentityIdByResourceAndExternalId,
  getLinkDataByIdentity,
} from './repos/channelUsers.js';
import {
  getDueReminderOccurrences,
  getEnabledReminderRules,
  getReminderRuleById,
  getReminderOccurrencesForRuleRange,
  getReminderOccurrenceOwnerUserId,
  getStaleReminderMessengerMessageIdForResend,
} from './repos/reminders.js';
import { getActiveDraftByIdentity, getOpenConversationByIdentity } from './repos/messageThreads.js';
import { getPhoneNormalizedForDeliveryLookup } from './repos/platformUserDeliveryPhone.js';
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

export function createDbReadPort(
  input: {
    db?: DbPort;
    remindersReadsPort?: RemindersReadsPort;
    appointmentsReadsPort?: AppointmentsReadsPort;
  } = {},
): DbReadPort {
  const db = input.db ?? createDbPort();
  const remindersReadsPort = input.remindersReadsPort;
  const appointmentsReadsPort = input.appointmentsReadsPort;
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
        case 'user.phoneForDeliveryLookup': {
          const userKey = asNonEmptyString(query.params.userKey);
          if (!userKey) return null as T;
          return (await getPhoneNormalizedForDeliveryLookup(db, userKey)) as T;
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
          return (await getActiveDraftByIdentity(db, {
            resource,
            externalId,
            ...(source ? { source } : {}),
          })) as T;
        }
        case 'platformUser.idByChannelBinding': {
          const channelCode = asNonEmptyString(query.params.channelCode ?? query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          if (!channelCode || !externalId) return null as T;
          const { resolveCanonicalPlatformUserIdByChannel } =
            await import('./repos/platformUserByChannel.js');
          return (await resolveCanonicalPlatformUserIdByChannel(db, {
            channelCode,
            externalId,
          })) as T;
        }
        case 'conversation.openByIdentity': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          const source = asNonEmptyString(query.params.source);
          if (!resource || !externalId) return null as T;
          return (await getOpenConversationByIdentity(db, {
            resource,
            externalId,
            ...(source ? { source } : {}),
          })) as T;
        }
        case 'identity.idByResourceAndExternalId': {
          const resource = asNonEmptyString(query.params.resource);
          const externalId = asNonEmptyString(query.params.externalId);
          if (!resource || !externalId) return null as T;
          return (await getIdentityIdByResourceAndExternalId(db, resource, externalId)) as T;
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
          const organizationId = asNonEmptyString(query.params.organizationId);
          if (!userId || !organizationId) {
            throw new Error('reminders.rules.forUser requires userId and organizationId');
          }
          if (!remindersReadsPort) {
            throw new Error('reminders product reads require remindersReadsPort');
          }
          return (await remindersReadsPort.listRulesForUser(userId, organizationId)) as T;
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
        case 'reminders.rule.byId': {
          const ruleId = asNonEmptyString(query.params.ruleId);
          if (!ruleId) return null as T;
          return (await getReminderRuleById(db, ruleId)) as T;
        }
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
        case 'reminders.occurrence.ownerUserId': {
          const occurrenceId = asNonEmptyString(query.params.occurrenceId);
          if (!occurrenceId) return null as T;
          const owner = await getReminderOccurrenceOwnerUserId(db, occurrenceId);
          return (owner ?? null) as T;
        }
        case 'reminders.delivery.staleMessengerMessage': {
          const ruleId = asNonEmptyString(query.params.ruleId);
          const excludeOccurrenceId = asNonEmptyString(query.params.excludeOccurrenceId);
          const channel = asNonEmptyString(query.params.channel);
          if (!ruleId || !excludeOccurrenceId || !channel) return null as T;
          const mid = await getStaleReminderMessengerMessageIdForResend(db, {
            ruleId,
            excludeOccurrenceId,
            channel,
          });
          return (mid ?? null) as T;
        }
        case 'identities.allByUserId': {
          const userIdParam = asNonEmptyString(query.params.userId);
          if (!userIdParam) return [] as T;
          return (await getChannelIdsByUserId(db, userIdParam)) as T;
        }
        default:
          return null as T;
      }
    },
  };
}
