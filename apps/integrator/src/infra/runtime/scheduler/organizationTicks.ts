import type { EventGateway, GatewayResult } from '../../../kernel/contracts/index.js';
import {
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

export type SchedulerOrganizationTickDeps = {
  eventGateway: EventGateway;
  listOrganizationIds: () => Promise<string[]>;
  nowIso: () => string;
  newEventId: () => string;
};

function assertAcceptedSchedulerResult(result: GatewayResult, organizationId: string): void {
  if (result.status === 'rejected') {
    throw new Error(`Scheduler organization tick rejected for ${organizationId}: ${result.reason}`);
  }
}

export async function runSchedulerOrganizationTicks(
  deps: SchedulerOrganizationTickDeps,
): Promise<number> {
  const organizationIds = await runWithInfraPrincipal(
    { source: 'scheduler:claim-due-jobs', portCapability: 'scheduler' },
    deps.listOrganizationIds,
  );
  const occurredAt = deps.nowIso();
  for (const organizationId of organizationIds) {
    const result = await runWithInfraPrincipal({ source: 'scheduler:handle-tick-event', portCapability: 'scheduler' }, () =>
      deps.eventGateway.handleIncomingEvent(
        {
          type: 'schedule.tick',
          meta: {
            eventId: `sch:${organizationId}:${deps.newEventId()}`,
            occurredAt,
            source: 'scheduler',
          },
          payload: {
            trigger: 'schedule.tick',
            organizationId,
          },
        },
        {
          runPipeline: (run) => runWithOrganizationPrincipal(organizationId, run),
        },
      ),
    );
    assertAcceptedSchedulerResult(result, organizationId);
  }
  return organizationIds.length;
}
