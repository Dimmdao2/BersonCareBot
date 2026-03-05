import type { IncomingEvent } from './events.js';
import type { StepMode } from './steps.js';
import type { Step } from './steps.js';

export type IdentityLink = {
  kind: string;
  value: string;
  provider?: string;
};

export type Preferences = {
  locale?: string;
  channels?: string[];
  delivery?: {
    firstAttemptDelaySeconds?: number;
    maxAttemptsBeforeFallback?: number;
  };
};

export type BaseContext = {
  actor: {
    isAdmin: boolean;
    tenantId?: string;
    projectId?: string;
  };
  identityLinks: IdentityLink[];
  preferences?: Preferences;
};

export type OrchestratorInput = {
  event: IncomingEvent;
  context: BaseContext;
};

export type OrchestratorPlanStep = Step;

export type OrchestratorPlan = OrchestratorPlanStep[];

export type ContentScriptStep = {
  action: string;
  mode?: StepMode;
  params?: Record<string, unknown>;
};

export type ContentScript = {
  id: string;
  source?: string;
  event?: string;
  enabled?: boolean;
  priority?: number;
  match?: Record<string, unknown>;
  conditions?: Array<unknown>;
  steps: ContentScriptStep[];
};

export type ContentTemplate = {
  id: string;
  text: string;
};
