import type { ScriptContext, Step, StepResult } from '../contracts/index.js';
import { domainActionRegistry } from './actions/index.js';
export { executeAction as executeDomainAction } from './executor/executeAction.js';

type MessageStepPayload = {
  recipient?: {
    chatId?: unknown;
    phoneNormalized?: unknown;
  };
  delivery?: {
    channels?: unknown;
    maxAttempts?: unknown;
  };
} & Record<string, unknown>;

/**
 * Builds domain-level fallback policy for message delivery.
 * This keeps channel selection rules in domain, not in infra connectors.
 */
function normalizeMessageStep(step: Step): Step {
  if (step.kind !== 'message.send') return step;
  const payload = step.payload as MessageStepPayload;
  const hasChat = typeof payload.recipient?.chatId === 'number';
  const hasPhone = typeof payload.recipient?.phoneNormalized === 'string'
    && payload.recipient.phoneNormalized.trim().length > 0;
  const channelsFromPayload = Array.isArray(payload.delivery?.channels)
    ? payload.delivery.channels.filter((item): item is string => typeof item === 'string')
    : [];
  const channels = channelsFromPayload.length > 0
    ? channelsFromPayload
    : hasChat && hasPhone
      ? ['telegram', 'smsc']
      : hasChat
        ? ['telegram']
        : ['smsc'];
  const normalizedPayload: MessageStepPayload = {
    ...payload,
    delivery: {
      channels,
      maxAttempts: typeof payload.delivery?.maxAttempts === 'number' ? payload.delivery.maxAttempts : 3,
    },
  };
  return { ...step, payload: normalizedPayload };
}

/**
 * Исполняет один шаг сценария через action-registry.
 */
export async function executeStep(step: Step, _ctx: ScriptContext): Promise<StepResult> {
  const normalizedStep = normalizeMessageStep(step);
  const handler = domainActionRegistry[normalizedStep.kind];
  if (handler) return handler(normalizedStep, _ctx);

  return {
    stepId: normalizedStep.id,
    status: 'skipped',
    data: { reason: `ACTION_NOT_IMPLEMENTED:${normalizedStep.kind}` },
  };
}
