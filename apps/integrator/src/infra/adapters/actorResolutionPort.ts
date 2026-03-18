import type { ActorResolutionPort, DbWritePort } from '../../kernel/contracts/index.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function createActorResolutionPort(input: { writePort: DbWritePort }): ActorResolutionPort {
  return {
    async ensureActor(request): Promise<void> {
      if (!request.isUserOriginated) return;
      const resource = asNonEmptyString(request.source);
      const externalActorId = asNonEmptyString(request.externalActorId);
      if (!resource || !externalActorId) return;

      await input.writePort.writeDb({
        type: 'user.upsert',
        params: {
          resource,
          externalId: externalActorId,
          ...(request.profile?.username ? { username: request.profile.username } : {}),
          ...(request.profile?.firstName ? { firstName: request.profile.firstName } : {}),
          ...(request.profile?.lastName ? { lastName: request.profile.lastName } : {}),
        },
      });
    },
  };
}
