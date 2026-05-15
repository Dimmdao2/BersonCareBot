import { describe, expect, it, vi } from 'vitest';
import { createDbReadPort } from './readPort.js';
import type { CommunicationReadsPort } from '../../kernel/contracts/index.js';
import type { RemindersReadsPort } from '../../kernel/contracts/index.js';
import type { AppointmentsReadsPort } from '../../kernel/contracts/index.js';
import type { SubscriptionMailingReadsPort } from '../../kernel/contracts/index.js';
import type { DbPort } from '../../kernel/contracts/index.js';
import { stubIntegratorDrizzleForTests } from './stubIntegratorDrizzleForTests.js';

/** Test double: `query`/`tx` are Vitest mocks (see `mockResolvedValue` / `mockImplementation`). */
type MockDbPort = DbPort & {
  query: ReturnType<typeof vi.fn>;
  tx: ReturnType<typeof vi.fn>;
  integratorDrizzle: ReturnType<typeof stubIntegratorDrizzleForTests> & {
    execute: ReturnType<typeof vi.fn>;
  };
};

function createMockDb(): MockDbPort {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const integratorDrizzle = stubIntegratorDrizzleForTests();
  const tx = vi.fn().mockImplementation(async (fn: (client: DbPort) => Promise<unknown>) =>
    fn({ query, tx, integratorDrizzle } as DbPort),
  );
  return { query, tx, integratorDrizzle } as MockDbPort;
}

describe('createDbReadPort', () => {
  describe('communication reads delegation', () => {
    it('conversation.listOpen delegates to communicationReadsPort when available', async () => {
      const adapterList = [{ id: 'c1', source: 'telegram', first_name: 'Admin' }];
      const communicationReadsPort: CommunicationReadsPort = {
        listOpenConversations: vi.fn().mockResolvedValue(adapterList),
        getConversationById: vi.fn(),
        listUnansweredQuestions: vi.fn(),
        getQuestionByConversationId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, communicationReadsPort });

      const result = await port.readDb({
        type: 'conversation.listOpen',
        params: { source: 'telegram', limit: 10 },
      });

      expect(result).toEqual(adapterList);
      expect(communicationReadsPort.listOpenConversations).toHaveBeenCalledWith({
        source: 'telegram',
        limit: 10,
      });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('conversation.listOpen falls back to DB when communicationReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'conversation.listOpen',
        params: { source: 'telegram', limit: 5 },
      });

      expect(result).toEqual([]);
      expect(db.integratorDrizzle.execute).toHaveBeenCalled();
    });

    it('conversation.byId delegates to communicationReadsPort when available', async () => {
      const adapterConv = { id: 'conv-1', source: 'telegram', first_name: 'User' };
      const communicationReadsPort: CommunicationReadsPort = {
        listOpenConversations: vi.fn(),
        getConversationById: vi.fn().mockResolvedValue(adapterConv),
        listUnansweredQuestions: vi.fn(),
        getQuestionByConversationId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, communicationReadsPort });

      const result = await port.readDb({
        type: 'conversation.byId',
        params: { id: 'conv-1' },
      });

      expect(result).toEqual(adapterConv);
      expect(communicationReadsPort.getConversationById).toHaveBeenCalledWith('conv-1');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('conversation.byId falls back to DB when communicationReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'conversation.byId',
        params: { id: 'conv-1' },
      });

      expect(result).toBeNull();
      expect(db.integratorDrizzle.execute).toHaveBeenCalled();
    });

    it('questions.unanswered delegates to communicationReadsPort when available', async () => {
      const adapterQuestions = [{ id: 'q1', text: 'Help', first_name: 'User' }];
      const communicationReadsPort: CommunicationReadsPort = {
        listOpenConversations: vi.fn(),
        getConversationById: vi.fn(),
        listUnansweredQuestions: vi.fn().mockResolvedValue(adapterQuestions),
        getQuestionByConversationId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, communicationReadsPort });

      const result = await port.readDb({
        type: 'questions.unanswered',
        params: { limit: 20 },
      });

      expect(result).toEqual(adapterQuestions);
      expect(communicationReadsPort.listUnansweredQuestions).toHaveBeenCalledWith({ limit: 20 });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('questions.unanswered falls back to DB when communicationReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'questions.unanswered',
        params: { limit: 20 },
      });

      expect(result).toEqual([]);
      expect(db.integratorDrizzle.execute).toHaveBeenCalled();
    });

    it('question.byConversationId delegates to communicationReadsPort when available', async () => {
      const adapterQuestion = { id: 'q1', answered: false };
      const communicationReadsPort: CommunicationReadsPort = {
        listOpenConversations: vi.fn(),
        getConversationById: vi.fn(),
        listUnansweredQuestions: vi.fn(),
        getQuestionByConversationId: vi.fn().mockResolvedValue(adapterQuestion),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, communicationReadsPort });

      const result = await port.readDb({
        type: 'question.byConversationId',
        params: { conversationId: 'conv-1' },
      });

      expect(result).toEqual(adapterQuestion);
      expect(communicationReadsPort.getQuestionByConversationId).toHaveBeenCalledWith('conv-1');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('question.byConversationId falls back to DB when communicationReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'question.byConversationId',
        params: { conversationId: 'conv-1' },
      });

      expect(result).toBeNull();
      expect(db.integratorDrizzle.execute).toHaveBeenCalled();
    });

    it('conversation.openByIdentity still uses local DB when communicationReadsPort is set', async () => {
      const communicationReadsPort: CommunicationReadsPort = {
        listOpenConversations: vi.fn(),
        getConversationById: vi.fn(),
        listUnansweredQuestions: vi.fn(),
        getQuestionByConversationId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, communicationReadsPort });

      await port.readDb({
        type: 'conversation.openByIdentity',
        params: { resource: 'telegram', externalId: '123' },
      });

      expect(db.integratorDrizzle.execute).toHaveBeenCalled();
      expect(communicationReadsPort.getConversationById).not.toHaveBeenCalled();
      expect(communicationReadsPort.listOpenConversations).not.toHaveBeenCalled();
    });
  });

  describe('reminders reads delegation', () => {
    it('reminders.rules.forUser delegates to remindersReadsPort when available', async () => {
      const adapterRules = [
        {
          id: 'rule-1',
          userId: '42',
          category: 'exercise',
          isEnabled: true,
          scheduleType: 'daily',
          timezone: 'UTC',
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: '1111111',
          contentMode: 'none',
        },
      ];
      const remindersReadsPort: RemindersReadsPort = {
        listRulesForUser: vi.fn().mockResolvedValue(adapterRules),
        getRuleForUserAndCategory: vi.fn(),
        listHistoryForUser: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, remindersReadsPort });

      const result = await port.readDb({
        type: 'reminders.rules.forUser',
        params: { userId: '42' },
      });

      expect(result).toEqual(adapterRules);
      expect(remindersReadsPort.listRulesForUser).toHaveBeenCalledWith('42');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('reminders.rules.forUser throws when remindersReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'reminders.rules.forUser',
          params: { userId: '42' },
        })
      ).rejects.toThrow('reminders product reads require remindersReadsPort');
    });

    it('reminders.rule.forUserAndCategory delegates to remindersReadsPort when available', async () => {
      const adapterRule = {
        id: 'rule-1',
        userId: '42',
        category: 'exercise',
        isEnabled: true,
        scheduleType: 'daily',
        timezone: 'UTC',
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: '1111111',
        contentMode: 'none',
      };
      const remindersReadsPort: RemindersReadsPort = {
        listRulesForUser: vi.fn(),
        getRuleForUserAndCategory: vi.fn().mockResolvedValue(adapterRule),
        listHistoryForUser: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, remindersReadsPort });

      const result = await port.readDb({
        type: 'reminders.rule.forUserAndCategory',
        params: { userId: '42', category: 'exercise' },
      });

      expect(result).toEqual(adapterRule);
      expect(remindersReadsPort.getRuleForUserAndCategory).toHaveBeenCalledWith('42', 'exercise');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('reminders.rule.forUserAndCategory throws when remindersReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'reminders.rule.forUserAndCategory',
          params: { userId: '42', category: 'exercise' },
        })
      ).rejects.toThrow('reminders product reads require remindersReadsPort');
    });

    it('reminders.occurrences.due still uses local DB when remindersReadsPort is set', async () => {
      const remindersReadsPort: RemindersReadsPort = {
        listRulesForUser: vi.fn(),
        getRuleForUserAndCategory: vi.fn(),
        listHistoryForUser: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, remindersReadsPort });

      await port.readDb({
        type: 'reminders.occurrences.due',
        params: { nowIso: '2025-01-01T12:00:00.000Z', limit: 10 },
      });

      expect(db.query).not.toHaveBeenCalled();
      expect(remindersReadsPort.listRulesForUser).not.toHaveBeenCalled();
    });

    it('reminders.rules.enabled still uses local DB when remindersReadsPort is set', async () => {
      const remindersReadsPort: RemindersReadsPort = {
        listRulesForUser: vi.fn(),
        getRuleForUserAndCategory: vi.fn(),
        listHistoryForUser: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, remindersReadsPort });

      await port.readDb({
        type: 'reminders.rules.enabled',
        params: {},
      });

      expect(db.query).not.toHaveBeenCalled();
      expect(remindersReadsPort.listRulesForUser).not.toHaveBeenCalled();
    });
  });

  describe('appointments reads delegation', () => {
    it('booking.byExternalId delegates to appointmentsReadsPort when available', async () => {
      const adapterRecord = {
        externalRecordId: 'rec-1',
        phoneNormalized: '+79991234567',
        payloadJson: {},
        recordAt: null as Date | null,
        status: 'created',
      };
      const appointmentsReadsPort: AppointmentsReadsPort = {
        getRecordByExternalId: vi.fn().mockResolvedValue(adapterRecord),
        getActiveRecordsByPhone: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, appointmentsReadsPort });

      const result = await port.readDb({
        type: 'booking.byExternalId',
        params: { externalRecordId: 'rec-1' },
      });

      expect(result).toEqual(adapterRecord);
      expect(appointmentsReadsPort.getRecordByExternalId).toHaveBeenCalledWith('rec-1');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('booking.byExternalId throws when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'booking.byExternalId',
          params: { externalRecordId: 'rec-1' },
        })
      ).rejects.toThrow(/appointmentsReadsPort|appointments product reads/);
    });

    it('booking.activeByUser delegates to appointmentsReadsPort when available', async () => {
      const adapterList = [
        { rubitimeRecordId: 'rec-1', recordAt: '2025-06-01T10:00:00.000Z', status: 'created', link: null },
      ];
      const appointmentsReadsPort: AppointmentsReadsPort = {
        getRecordByExternalId: vi.fn(),
        getActiveRecordsByPhone: vi.fn().mockResolvedValue(adapterList),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, appointmentsReadsPort });

      const result = await port.readDb({
        type: 'booking.activeByUser',
        params: { userId: '+79991234567' },
      });

      expect(result).toEqual(adapterList);
      expect(appointmentsReadsPort.getActiveRecordsByPhone).toHaveBeenCalledWith('+79991234567');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('booking.activeByUser throws when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'booking.activeByUser',
          params: { userId: '+79991234567' },
        })
      ).rejects.toThrow(/appointmentsReadsPort|appointments product reads/);
    });
  });

  describe('subscription/mailing reads (webapp-only)', () => {
    it('mailing.topics.list without port returns []', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'mailing.topics.list',
        params: {},
      });

      expect(result).toEqual([]);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('mailing.topics.list with port delegates to port', async () => {
      const adapterTopics = [
        { integratorTopicId: '1', code: 'news', title: 'News', key: 'news', isActive: true },
      ];
      const subscriptionMailingReadsPort: SubscriptionMailingReadsPort = {
        listTopics: vi.fn().mockResolvedValue(adapterTopics),
        getSubscriptionsByUserId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, subscriptionMailingReadsPort });

      const result = await port.readDb({
        type: 'mailing.topics.list',
        params: {},
      });

      expect(result).toEqual(adapterTopics);
      expect(subscriptionMailingReadsPort.listTopics).toHaveBeenCalledTimes(1);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('subscriptions.byUser without port returns []', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      const result = await port.readDb({
        type: 'subscriptions.byUser',
        params: { integratorUserId: '42' },
      });

      expect(result).toEqual([]);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('subscriptions.byUser with empty integratorUserId returns [] without calling port', async () => {
      const subscriptionMailingReadsPort: SubscriptionMailingReadsPort = {
        listTopics: vi.fn(),
        getSubscriptionsByUserId: vi.fn(),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, subscriptionMailingReadsPort });

      const result = await port.readDb({
        type: 'subscriptions.byUser',
        params: { integratorUserId: '' },
      });

      expect(result).toEqual([]);
      expect(subscriptionMailingReadsPort.getSubscriptionsByUserId).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('subscriptions.byUser with port delegates to port', async () => {
      const adapterSubs = [
        { integratorTopicId: '1', topicCode: 'news', isActive: true },
      ];
      const subscriptionMailingReadsPort: SubscriptionMailingReadsPort = {
        listTopics: vi.fn(),
        getSubscriptionsByUserId: vi.fn().mockResolvedValue(adapterSubs),
      };
      const db = createMockDb();
      const port = createDbReadPort({ db, subscriptionMailingReadsPort });

      const result = await port.readDb({
        type: 'subscriptions.byUser',
        params: { integratorUserId: '42' },
      });

      expect(result).toEqual(adapterSubs);
      expect(subscriptionMailingReadsPort.getSubscriptionsByUserId).toHaveBeenCalledWith('42');
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('user.phoneForDeliveryLookup', () => {
    it('returns phone_normalized when DB finds integrator_user_id', async () => {
      const db = createMockDb();
      db.query.mockResolvedValue({ rows: [{ phone_normalized: '+79991112233' }] });
      const port = createDbReadPort({ db });
      const result = await port.readDb({
        type: 'user.phoneForDeliveryLookup',
        params: { userKey: '1001' },
      });
      expect(result).toBe('+79991112233');
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('returns null for empty userKey without querying', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });
      const result = await port.readDb({
        type: 'user.phoneForDeliveryLookup',
        params: { userKey: '' },
      });
      expect(result).toBeNull();
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
