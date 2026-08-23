/**
 * D25 (owner decision 23.08.2026): `ensureActor` is the single call site `createIncomingEventPipeline`
 * uses for EVERY user-originated message/callback (`incomingEventPipeline.ts` `ensureResolvedActor`).
 * These tests pin the behavior that keeps a generic, unresolved Telegram/MAX actor from creating
 * anything: the port always dispatches at most the lookup-only `user.upsert` write and never turns an
 * unresolved actor into a thrown error.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DbWriteMutation, DbWritePort } from '../../kernel/contracts/index.js';
import { createActorResolutionPort } from './actorResolutionPort.js';

function writePortSpy(impl?: (mutation: DbWriteMutation) => Promise<void>): {
  port: DbWritePort;
  calls: DbWriteMutation[];
} {
  const calls: DbWriteMutation[] = [];
  const port: DbWritePort = {
    writeDb: vi.fn(async (mutation: DbWriteMutation) => {
      calls.push(mutation);
      if (impl) await impl(mutation);
      return undefined;
    }),
  };
  return { port, calls };
}

describe('createActorResolutionPort — D25 unresolved-actor safety', () => {
  it('dispatches exactly one lookup-only user.upsert write for an unknown, user-originated Telegram actor and resolves without throwing', async () => {
    const { port: writePort, calls } = writePortSpy();
    const port = createActorResolutionPort({ writePort });

    await expect(
      port.ensureActor({
        source: 'telegram',
        isUserOriginated: true,
        externalActorId: 'unknown-telegram-id-1',
        profile: { username: 'stranger' },
      }),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      type: 'user.upsert',
      params: {
        resource: 'telegram',
        externalId: 'unknown-telegram-id-1',
        username: 'stranger',
      },
    });
  });

  it('dispatches exactly one lookup-only user.upsert write for an unknown, user-originated MAX actor and resolves without throwing', async () => {
    const { port: writePort, calls } = writePortSpy();
    const port = createActorResolutionPort({ writePort });

    await expect(
      port.ensureActor({
        source: 'max',
        isUserOriginated: true,
        externalActorId: 'unknown-max-id-1',
      }),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      type: 'user.upsert',
      params: { resource: 'max', externalId: 'unknown-max-id-1' },
    });
  });

  it('never fails the pipeline merely because the underlying write resolved an unresolved actor (root returned nothing to write back)', async () => {
    // The lookup-only root itself is fire-and-forget from this port's point of view: `writeDb` for
    // `user.upsert` never returns a value the caller inspects (`writePort.ts` discards the result).
    // A resolved promise here — whatever the root found or didn't find — is the whole contract.
    const { port: writePort } = writePortSpy(async () => undefined);
    const port = createActorResolutionPort({ writePort });

    await expect(
      port.ensureActor({
        source: 'telegram',
        isUserOriginated: true,
        externalActorId: 'unknown-telegram-id-2',
      }),
    ).resolves.toBeUndefined();
  });

  it('does not write anything for a non-user-originated event (system/scheduled events never resolve an actor)', async () => {
    const { port: writePort, calls } = writePortSpy();
    const port = createActorResolutionPort({ writePort });

    await port.ensureActor({
      source: 'telegram',
      isUserOriginated: false,
      externalActorId: 'some-id',
    });

    expect(calls).toHaveLength(0);
  });
});
