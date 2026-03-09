import type {
  ActorResolutionPort,
  DbReadPort,
  DeliveryDefaultsPort,
  DispatchPort,
  DbWritePort,
  IncomingEvent,
  Orchestrator,
  QueuePort,
  TemplatePort,
} from '../contracts/index.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../domain/index.js';

export type IncomingEventPipelineDeps = {
  readPort: DbReadPort;
  writePort: DbWritePort;
  queuePort: QueuePort;
  dispatchPort: DispatchPort;
  orchestrator: Orchestrator;
  templatePort: TemplatePort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
  actorResolutionPort?: ActorResolutionPort;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumberString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return asString(value);
}

async function ensureResolvedActor(
  event: IncomingEvent,
  actorResolutionPort?: ActorResolutionPort,
): Promise<void> {
  if (!actorResolutionPort) return;
  const incoming = asRecord(event.payload.incoming);
  if (!incoming) return;

  const source = asString(event.meta.source);
  if (!source) return;

  const externalActorId = asNumberString(incoming.channelUserId)
    ?? asString(incoming.channelId)
    ?? asString(event.meta.userId);
  const isUserOriginated = externalActorId !== null && (event.type === 'message.received' || event.type === 'callback.received');
  const username = asString(incoming.channelUsername);
  const firstName = asString(incoming.channelFirstName);
  const lastName = asString(incoming.channelLastName);

  await actorResolutionPort.ensureActor({
    source,
    isUserOriginated,
    ...(externalActorId ? { externalActorId } : {}),
    ...((username || firstName || lastName)
      ? {
          profile: {
            ...(username ? { username } : {}),
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
          },
        }
      : {}),
  });
}

export function createIncomingEventPipeline(deps: IncomingEventPipelineDeps): {
  run: (event: IncomingEvent) => Promise<void>;
} {
  return {
    async run(event: IncomingEvent): Promise<void> {
      await ensureResolvedActor(event, deps.actorResolutionPort);
      await processAcceptedIncomingEvent(event, {
        readPort: deps.readPort,
        orchestrator: deps.orchestrator,
        async executeAction(action, context) {
          return executeDomainAction(action, context, {
            readPort: deps.readPort,
            writePort: deps.writePort,
            queuePort: deps.queuePort,
            templatePort: deps.templatePort,
            ...(deps.deliveryDefaultsPort !== undefined ? { deliveryDefaultsPort: deps.deliveryDefaultsPort } : {}),
          });
        },
        async dispatchIntent(intent) {
          await deps.dispatchPort.dispatchOutgoing(intent);
        },
      });
    },
  };
}
