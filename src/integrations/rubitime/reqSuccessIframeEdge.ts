import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import type { EventGateway, IncomingEvent } from '../../kernel/contracts/index.js';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

/**
 * Registers Rubitime reqSuccess iframe endpoint via integrations layer wiring.
 * Flow remains unchanged, but dependency assembly is centralized here.
 */
export function registerRubitimeIframeEdgeRoute(
  app: FastifyInstance,
  deps: {
    eventGateway: EventGateway;
    onAcceptedEvent?: (event: IncomingEvent) => Promise<{ showButton: boolean; recordId: string }>;
  },
): void {
  // ARCH-V3 MOVE
  // этот wiring должен быть убран из integrations/rubitime (step 12)
  // и переведён в единый pipeline через eventGateway/domain/orchestrator/runtime
  registerRubitimeReqSuccessIframeRoute(app, {
    eventGateway: deps.eventGateway,
    ...(deps.onAcceptedEvent ? { onAcceptedEvent: deps.onAcceptedEvent } : {}),
    delayMinMs: env.RUBITIME_REQSUCCESS_DELAY_MIN_MS,
    delayMaxMs: env.RUBITIME_REQSUCCESS_DELAY_MAX_MS,
    ipLimitPerMin: env.RUBITIME_REQSUCCESS_IP_LIMIT_PER_MIN,
    globalLimitPerMin: env.RUBITIME_REQSUCCESS_GLOBAL_LIMIT_PER_MIN,
  });
}
