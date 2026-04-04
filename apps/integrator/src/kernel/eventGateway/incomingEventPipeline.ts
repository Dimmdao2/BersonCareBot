import type {
  ActorResolutionPort,
  ContentCatalogPort,
  ContentPort,
  DbReadPort,
  DeliveryDefaultsPort,
  DeliveryTargetsPort,
  DispatchPort,
  DbWritePort,
  IncomingEvent,
  Orchestrator,
  ProtectedAccessPort,
  QueuePort,
  RemindersWebappWritesPort,
  TemplatePort,
  WebappEventsPort,
} from '../contracts/index.js';
import type { SupportRelayPolicy } from '../domain/executor/helpers.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../domain/index.js';

export type IncomingEventPipelineDeps = {
  readPort: DbReadPort;
  writePort: DbWritePort;
  queuePort: QueuePort;
  dispatchPort: DispatchPort;
  orchestrator: Orchestrator;
  templatePort: TemplatePort;
  contentCatalogPort?: ContentCatalogPort;
  protectedAccessPort?: ProtectedAccessPort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
  actorResolutionPort?: ActorResolutionPort;
  /** When true, executor attaches main reply keyboard to every message to user that has no keyboard. */
  sendMenuOnButtonPress?: boolean;
  contentPort?: ContentPort;
  /** Policy for support relay allowed message types. When unset, default from app config is used. */
  supportRelayPolicy?: SupportRelayPolicy | null;
  /** Optional: emit signed events to webapp (e.g. diary.symptom.*). */
  webappEventsPort?: WebappEventsPort;
  /** Optional: resolve delivery targets for multi-channel fan-out (e.g. Rubitime/booking). */
  deliveryTargetsPort?: DeliveryTargetsPort;
  remindersWebappWritesPort?: RemindersWebappWritesPort;
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
          const executorDeps = {
            readPort: deps.readPort,
            writePort: deps.writePort,
            dispatchPort: deps.dispatchPort,
            queuePort: deps.queuePort,
            templatePort: deps.templatePort,
            ...(deps.contentCatalogPort ? { contentCatalogPort: deps.contentCatalogPort } : {}),
            ...(deps.protectedAccessPort ? { protectedAccessPort: deps.protectedAccessPort } : {}),
            ...(deps.deliveryDefaultsPort !== undefined ? { deliveryDefaultsPort: deps.deliveryDefaultsPort } : {}),
            ...(deps.sendMenuOnButtonPress !== undefined ? { sendMenuOnButtonPress: deps.sendMenuOnButtonPress } : {}),
            ...(deps.contentPort ? { contentPort: deps.contentPort } : {}),
            ...(deps.supportRelayPolicy !== undefined && deps.supportRelayPolicy !== null ? { supportRelayPolicy: deps.supportRelayPolicy } : {}),
            ...(deps.webappEventsPort ? { webappEventsPort: deps.webappEventsPort } : {}),
            ...(deps.deliveryTargetsPort ? { deliveryTargetsPort: deps.deliveryTargetsPort } : {}),
            ...(deps.remindersWebappWritesPort ? { remindersWebappWritesPort: deps.remindersWebappWritesPort } : {}),
            executeAction: executeDomainAction,
          };
          return executeDomainAction(action, context, executorDeps);
        },
        async dispatchIntent(intent) {
          await deps.dispatchPort.dispatchOutgoing(intent);
        },
      });
    },
  };
}
