import { describe, expect, it, vi } from 'vitest';
import type { DispatchPort, IdempotencyPort } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import {
  forwardDedicatedBotInbound,
  type DedicatedBotInboundForwardDeps,
} from './clinicBotInboundForward.js';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function message(overrides: Partial<Extract<IncomingUpdate, { kind: 'message' }>> = {}) {
  return {
    kind: 'message' as const,
    chatId: 42,
    channelId: 'patient-42',
    messageId: 'provider-message-7',
    text: 'Нужна помощь',
    userRow: null,
    userState: '',
    ...overrides,
  };
}

function memoryIdempotency(): IdempotencyPort & { keys: Set<string> } {
  const keys = new Set<string>();
  return {
    keys,
    async tryAcquire(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    async release(key) {
      keys.delete(key);
    },
  };
}

function dependencies(input?: {
  idempotencyPort?: IdempotencyPort;
  dispatchOutgoing?: DispatchPort['dispatchOutgoing'];
  resolveInboundForwarding?: () => Promise<{ enabled: true; destinationChatId: string } | null>;
}): DedicatedBotInboundForwardDeps {
  const dispatchOutgoing: DispatchPort['dispatchOutgoing'] =
    input?.dispatchOutgoing ?? vi.fn(async () => ({}));
  return {
    dispatchPort: { dispatchOutgoing },
    resolveInboundForwarding:
      input?.resolveInboundForwarding ??
      vi.fn(async () => ({ enabled: true as const, destinationChatId: '123456' })),
    ...(input?.idempotencyPort ? { idempotencyPort: input.idempotencyPort } : {}),
  };
}

describe('dedicated clinic-bot inbound forwarding acceptance', () => {
  it.each([
    ['telegram', { chatId: 123456 }],
    ['max', { userId: 123456 }],
  ] as const)(
    'forwards exact text directly through %s clinic dispatch',
    async (channel, recipient) => {
      const dispatchOutgoing = vi.fn(async () => ({}));
      const deps = dependencies({ dispatchOutgoing });

      await expect(
        forwardDedicatedBotInbound(
          {
            channel,
            organizationId: ORG_A,
            incoming: message(),
            eventId: 'transport-event-1',
            correlationId: 'correlation-1',
          },
          deps,
        ),
      ).resolves.toBe('forwarded');

      expect(dispatchOutgoing).toHaveBeenCalledOnce();
      expect(dispatchOutgoing).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            recipient,
            message: { text: 'Нужна помощь' },
            delivery: {
              channels: [channel],
              maxAttempts: 1,
              senderScope: 'clinic_required',
            },
          },
        }),
      );
    },
  );

  it('deduplicates by stable provider message identity without mixing organizations or channels', async () => {
    const idempotencyPort = memoryIdempotency();
    const dispatchOutgoing = vi.fn(async () => ({}));
    const deps = dependencies({ idempotencyPort, dispatchOutgoing });
    const first = {
      channel: 'telegram' as const,
      organizationId: ORG_A,
      incoming: message(),
      eventId: 'random-event-1',
      correlationId: 'correlation-1',
    };

    await expect(forwardDedicatedBotInbound(first, deps)).resolves.toBe('forwarded');
    await expect(
      forwardDedicatedBotInbound(
        { ...first, eventId: 'different-random-event', correlationId: 'correlation-2' },
        deps,
      ),
    ).resolves.toBe('duplicate');
    await expect(
      forwardDedicatedBotInbound({ ...first, organizationId: ORG_B }, deps),
    ).resolves.toBe('forwarded');
    await expect(forwardDedicatedBotInbound({ ...first, channel: 'max' }, deps)).resolves.toBe(
      'forwarded',
    );

    expect(dispatchOutgoing).toHaveBeenCalledTimes(3);
    expect([...idempotencyPort.keys]).toEqual([
      `dedicated-bot-forward:telegram:${ORG_A}:patient-42:provider-message-7`,
      `dedicated-bot-forward:telegram:${ORG_B}:patient-42:provider-message-7`,
      `dedicated-bot-forward:max:${ORG_A}:patient-42:provider-message-7`,
    ]);
  });

  it('treats disabled or unconfigured forwarding as a normal no-op', async () => {
    const idempotencyPort = memoryIdempotency();
    const dispatchOutgoing = vi.fn(async () => ({}));
    const deps = dependencies({
      idempotencyPort,
      dispatchOutgoing,
      resolveInboundForwarding: async () => null,
    });

    await expect(
      forwardDedicatedBotInbound(
        {
          channel: 'telegram',
          organizationId: ORG_A,
          incoming: message(),
          eventId: 'event-1',
          correlationId: 'correlation-1',
        },
        deps,
      ),
    ).resolves.toBe('ignored');
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    expect(idempotencyPort.keys.size).toBe(0);
  });

  it('fails visibly and leaves the provider event retryable after dispatch failure', async () => {
    const idempotencyPort = memoryIdempotency();
    const deps = dependencies({
      idempotencyPort,
      dispatchOutgoing: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
    });

    await expect(
      forwardDedicatedBotInbound(
        {
          channel: 'telegram',
          organizationId: ORG_A,
          incoming: message(),
          eventId: 'event-1',
          correlationId: 'correlation-1',
        },
        deps,
      ),
    ).rejects.toThrow('provider unavailable');
    expect(idempotencyPort.keys.size).toBe(0);
  });

  it('propagates config and idempotency failures before dispatch', async () => {
    const configFailure = dependencies({
      resolveInboundForwarding: async () => {
        throw new Error('config unavailable');
      },
    });
    const idempotencyFailure = dependencies({
      idempotencyPort: {
        async tryAcquire() {
          throw new Error('idempotency unavailable');
        },
      },
    });
    const input = {
      channel: 'telegram' as const,
      organizationId: ORG_A,
      incoming: message(),
      eventId: 'event-1',
      correlationId: 'correlation-1',
    };

    await expect(forwardDedicatedBotInbound(input, configFailure)).rejects.toThrow(
      'config unavailable',
    );
    await expect(forwardDedicatedBotInbound(input, idempotencyFailure)).rejects.toThrow(
      'idempotency unavailable',
    );
    expect(configFailure.dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
    expect(idempotencyFailure.dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('does not round a MAX destination identity outside the safe integer range', async () => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    const deps = dependencies({
      dispatchOutgoing,
      resolveInboundForwarding: async () => ({
        enabled: true,
        destinationChatId: '9007199254740993',
      }),
    });

    await expect(
      forwardDedicatedBotInbound(
        {
          channel: 'max',
          organizationId: ORG_A,
          incoming: message(),
          eventId: 'event-1',
          correlationId: 'correlation-1',
        },
        deps,
      ),
    ).rejects.toThrow('DEDICATED_BOT_FORWARD_DESTINATION_INVALID');
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it.each([
    message({ text: '/start' }),
    message({ action: 'start' }),
    message({ contactPhone: '+79990000000' }),
  ])('does not forward bot-owned command/contact traffic', async (incoming) => {
    const dispatchOutgoing = vi.fn(async () => ({}));
    const deps = dependencies({ dispatchOutgoing });

    await expect(
      forwardDedicatedBotInbound(
        {
          channel: 'telegram',
          organizationId: ORG_A,
          incoming,
          eventId: 'event-1',
          correlationId: 'correlation-1',
        },
        deps,
      ),
    ).resolves.toBe('ignored');
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });
});
