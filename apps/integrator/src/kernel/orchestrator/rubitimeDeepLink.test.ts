/**
 * Тесты входящих по deep-link от RubiTime: /start setrubitimerecord_<id>.
 * Проверяем: 1) не уходит в "Новый вопрос"; 2) привязка номера по recordId (поиск записи).
 */
import { describe, expect, it, vi } from 'vitest';
import type { BaseContext, ContentPort, ContextQueryPort, IncomingEvent } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

const SETRUBITIMERECORD_SCRIPT = {
  id: 'telegram.start.setrubitimerecord',
  source: 'telegram',
  event: 'message.received',
  match: { input: { action: 'start.setrubitimerecord' } },
  conditions: [
    { kind: 'context.query', name: 'bookingRecord', query: { type: 'booking.recordByExternalId', recordId: '{{input.recordId}}' } },
    { kind: 'context.query', name: 'bookings', query: { type: 'bookings.forUser', userId: '{{queries.bookingRecord.record.phoneNormalized}}' } },
  ],
  steps: [
    {
      action: 'user.phone.link',
      mode: 'sync',
      params: {
        _when: { path: 'queries.bookingRecord.record.phoneNormalized', truthy: true },
        channelUserId: '{{actor.channelUserId}}',
        phoneNormalized: '{{queries.bookingRecord.record.phoneNormalized}}',
      },
    },
    { action: 'user.state.set', mode: 'sync', params: { channelUserId: '{{actor.channelUserId}}', state: 'idle' } },
    {
      action: 'message.inlineKeyboard.show',
      mode: 'async',
      params: {
        _when: {
          and: [
            { path: 'queries.bookingRecord.record.phoneNormalized', truthy: true },
            { path: 'queries.bookings.items.length', equals: 0 },
          ],
        },
        chatId: '{{actor.chatId}}',
        templateKey: 'telegram:noBookings',
      },
    },
    {
      action: 'message.inlineKeyboard.show',
      mode: 'async',
      params: {
        _when: {
          and: [
            { path: 'queries.bookingRecord.record.phoneNormalized', truthy: true },
            { path: 'queries.bookings.items.length', truthy: true },
          ],
        },
        chatId: '{{actor.chatId}}',
        templateKey: 'telegram:bookingsList',
      },
    },
    {
      action: 'message.replyKeyboard.show',
      mode: 'async',
      params: {
        _when: { path: 'queries.bookingRecord.record.phoneNormalized', truthy: false },
        chatId: '{{actor.chatId}}',
        templateKey: 'telegram:chooseMenu',
      },
    },
  ],
};

const MENU_DEFAULT_SCRIPT = {
  id: 'telegram.menu.default',
  source: 'telegram',
  event: 'message.received',
  match: {
    actor: { isAdmin: false },
    context: { conversationState: { $notIn: ['diary.symptom.awaiting_title', 'diary.lfk.awaiting_title'] } },
    input: {
      textPresent: true,
      excludeActions: ['booking.open', 'menu.more', 'cabinet.open', 'diary.open', 'start.setrubitimerecord', 'start.noticeme', 'start.set'],
      excludeTexts: ['/start'],
    },
  },
  steps: [{ action: 'draft.send', mode: 'sync', params: { adminTemplateKey: 'telegram:adminForward' } }],
};

function buildRubitimeDeepLinkEvent(recordId: string, text = `/start setrubitimerecord_${recordId}`): IncomingEvent {
  return {
    type: 'message.received',
    meta: { eventId: `evt-rubitime-${recordId}`, occurredAt: '2026-03-18T12:00:00.000Z', source: 'telegram' },
    payload: {
      incoming: {
        action: 'start.setrubitimerecord',
        text,
        chatId: 1524348397,
        channelUserId: '1524348397',
        recordId,
      },
    },
  };
}

describe('RubiTime deep-link /start setrubitimerecord_<id>', () => {
  it('selects setrubitimerecord script (not menu.default): no question flow', async () => {
    const event = buildRubitimeDeepLinkEvent('7967313');
    const baseContext: BaseContext = { actor: { isAdmin: false }, identityLinks: [], hasOpenConversation: false };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn()
        .mockResolvedValueOnce({
          type: 'booking.recordByExternalId',
          record: { phoneNormalized: '+79161234567', id: '7967313' },
        })
        .mockResolvedValueOnce({ type: 'bookings.forUser', items: [] }),
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([SETRUBITIMERECORD_SCRIPT, MENU_DEFAULT_SCRIPT]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan.some((s) => s.kind === 'admin.forward' || s.kind === 'draft.send')).toBe(false);
    expect(plan.some((s) => s.kind === 'user.phone.link')).toBe(true);
    const linkStep = plan.find((s) => s.kind === 'user.phone.link');
    expect(linkStep?.payload).toMatchObject({ phoneNormalized: '+79161234567', channelUserId: '1524348397' });

    expect(contextQueryPort.request).toHaveBeenNthCalledWith(1, {
      type: 'booking.recordByExternalId',
      recordId: '7967313',
    });
    expect(contextQueryPort.request).toHaveBeenNthCalledWith(2, {
      type: 'bookings.forUser',
      userId: '+79161234567',
    });
  });

  it('links different phone when recordId points to another number', async () => {
    const event = buildRubitimeDeepLinkEvent('12345');
    const baseContext: BaseContext = { actor: { isAdmin: false }, identityLinks: [], hasOpenConversation: false };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn()
        .mockResolvedValueOnce({
          type: 'booking.recordByExternalId',
          record: { phoneNormalized: '+79039887766', id: '12345' },
        })
        .mockResolvedValueOnce({ type: 'bookings.forUser', items: [{ recordAt: '2026-03-20 10:00' }] }),
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([SETRUBITIMERECORD_SCRIPT, MENU_DEFAULT_SCRIPT]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan.some((s) => s.kind === 'admin.forward' || s.kind === 'draft.send')).toBe(false);
    const linkStep = plan.find((s) => s.kind === 'user.phone.link');
    expect(linkStep?.payload).toMatchObject({ phoneNormalized: '+79039887766' });
    expect(contextQueryPort.request).toHaveBeenNthCalledWith(1, { type: 'booking.recordByExternalId', recordId: '12345' });
    expect(contextQueryPort.request).toHaveBeenNthCalledWith(2, { type: 'bookings.forUser', userId: '+79039887766' });
  });

  it('when record not found: no phone link, fallback to chooseMenu (no question)', async () => {
    const event = buildRubitimeDeepLinkEvent('999999');
    const baseContext: BaseContext = { actor: { isAdmin: false }, identityLinks: [], hasOpenConversation: false };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn()
        .mockResolvedValueOnce({ type: 'booking.recordByExternalId', record: null })
        .mockResolvedValueOnce({ type: 'bookings.forUser', items: [] }),
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([SETRUBITIMERECORD_SCRIPT, MENU_DEFAULT_SCRIPT]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan.some((s) => s.kind === 'admin.forward' || s.kind === 'draft.send')).toBe(false);
    expect(plan.some((s) => s.kind === 'user.phone.link')).toBe(false);
    expect(plan.some((s) => s.kind === 'message.replyKeyboard.show')).toBe(true);
    const menuStep = plan.find((s) => s.kind === 'message.replyKeyboard.show');
    expect(menuStep?.payload).toMatchObject({ templateKey: 'telegram:chooseMenu' });

    expect(contextQueryPort.request).toHaveBeenNthCalledWith(1, { type: 'booking.recordByExternalId', recordId: '999999' });
  });

  it('record with phone but no bookings: shows noBookings screen and still links phone', async () => {
    const event = buildRubitimeDeepLinkEvent('555');
    const baseContext: BaseContext = { actor: { isAdmin: false }, identityLinks: [], hasOpenConversation: false };

    const contextQueryPort: ContextQueryPort = {
      request: vi.fn()
        .mockResolvedValueOnce({
          type: 'booking.recordByExternalId',
          record: { phoneNormalized: '+79165554433', id: '555' },
        })
        .mockResolvedValueOnce({ type: 'bookings.forUser', items: [] }),
    };

    const contentPort: ContentPort = {
      getScriptsBySource: vi.fn().mockResolvedValue([SETRUBITIMERECORD_SCRIPT, MENU_DEFAULT_SCRIPT]),
      getTemplate: vi.fn().mockResolvedValue(null),
    };

    const plan = await buildPlan({ event, context: baseContext }, { contentPort, contextQueryPort });

    expect(plan.some((s) => s.kind === 'user.phone.link')).toBe(true);
    expect(plan.find((s) => s.kind === 'user.phone.link')?.payload).toMatchObject({ phoneNormalized: '+79165554433' });
    const noBookingsStep = plan.find((s) => s.kind === 'message.inlineKeyboard.show' && (s.payload as { templateKey?: string })?.templateKey === 'telegram:noBookings');
    expect(noBookingsStep).toBeDefined();
  });
});
