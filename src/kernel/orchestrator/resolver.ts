import type {
  ContentPort,
  ContextQueryPort,
  ContextQuery,
  OrchestratorInput,
  OrchestratorPlan,
  OrchestratorPlanStep,
} from '../contracts/index.js';

type StepWhen = {
  path?: string;
  equals?: unknown;
  notEquals?: unknown;
  in?: unknown[];
  exists?: boolean;
  truthy?: boolean;
  and?: StepWhen[];
  or?: StepWhen[];
  not?: StepWhen;
};

type ScriptCondition = {
  kind: 'context.query';
  name: string;
  query: ContextQuery;
};

type ScriptStep = {
  action: string;
  mode?: 'sync' | 'async';
  params?: Record<string, unknown>;
};

type ScriptShape = {
  id: string;
  steps: ScriptStep[];
  conditions?: Array<unknown>;
};

type RouteRule = {
  id: string;
  enabled?: boolean;
  priority?: number;
  match: {
    source: string;
    eventType: string;
    meta?: Record<string, unknown>;
  };
  scriptId: string;
};

type RoutedContentPort = ContentPort & {
  getRoutes?: (scope: string) => Promise<RouteRule[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPathValue(source: unknown, path: string): unknown {
  const segments = path.split('.').filter((part) => part.length > 0);
  let current: unknown = source;
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    const index = Number(segment);
    if (Array.isArray(current) && Number.isInteger(index)) {
      current = current[index];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateWhen(when: StepWhen, vars: Record<string, unknown>): boolean {
  if (when.and && Array.isArray(when.and)) {
    return when.and.every((item) => evaluateWhen(item, vars));
  }
  if (when.or && Array.isArray(when.or)) {
    return when.or.some((item) => evaluateWhen(item, vars));
  }
  if (when.not) return !evaluateWhen(when.not, vars);

  const value = when.path ? getPathValue(vars, when.path) : undefined;
  if (typeof when.exists === 'boolean') return when.exists ? value !== undefined : value === undefined;
  if (typeof when.truthy === 'boolean') return when.truthy ? Boolean(value) : !Boolean(value);
  if (Object.prototype.hasOwnProperty.call(when, 'equals')) return value === when.equals;
  if (Object.prototype.hasOwnProperty.call(when, 'notEquals')) return value !== when.notEquals;
  if (Array.isArray(when.in)) return when.in.includes(value as never);
  return Boolean(value);
}

function interpolate(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const replacement = getPathValue(vars, key);
      return typeof replacement === 'string' || typeof replacement === 'number'
        ? String(replacement)
        : '';
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolate(v, vars);
    }
    return result;
  }
  return value;
}

async function resolveTemplateParams(
  params: Record<string, unknown>,
  contentPort: ContentPort,
): Promise<Record<string, unknown>> {
  const templateKey = typeof params.templateKey === 'string' ? params.templateKey : null;
  if (!templateKey) return params;

  const template = await contentPort.getTemplate(templateKey);
  const nextParams = { ...params };
  delete nextParams.templateKey;
  if (!template || typeof template.text !== 'string') return nextParams;

  const message = isRecord(nextParams.message) ? { ...nextParams.message } : null;
  if (message && typeof message.text !== 'string') {
    message.text = template.text;
    nextParams.message = message;
  }
  if (typeof nextParams.messageText !== 'string') {
    nextParams.messageText = template.text;
  }
  if (typeof nextParams.text !== 'string') {
    nextParams.text = template.text;
  }
  return nextParams;
}

async function runContextQueries(
  conditions: Array<unknown> | undefined,
  vars: Record<string, unknown>,
  contextQueryPort: ContextQueryPort,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(conditions)) return {};
  const results: Record<string, unknown> = {};
  for (const item of conditions) {
    if (!isRecord(item)) continue;
    if (item.kind !== 'context.query') continue;
    const name = typeof item.name === 'string' ? item.name : '';
    if (!name) continue;
    const query = interpolate(item.query, vars) as ContextQuery;
    if (!isRecord(query) || typeof query.type !== 'string') continue;
    results[name] = await contextQueryPort.request(query);
  }
  return results;
}

function toPlanStep(step: ScriptStep, input: OrchestratorInput, index: number, vars: Record<string, unknown>): OrchestratorPlanStep {
  return {
    id: `step:${input.event.meta.eventId}:${index}`,
    kind: step.action,
    mode: step.mode ?? 'sync',
    payload: (interpolate(step.params ?? {}, vars) as Record<string, unknown>),
  };
}

function routeMatches(rule: RouteRule, input: OrchestratorInput): boolean {
  if (rule.enabled === false) return false;
  if (rule.match.source !== input.event.meta.source) return false;
  if (rule.match.eventType !== input.event.type) return false;

  const metaMatch = rule.match.meta;
  if (!metaMatch) return true;
  for (const [key, expected] of Object.entries(metaMatch)) {
    if ((input.event.meta as Record<string, unknown>)[key] !== expected) return false;
  }
  return true;
}

async function resolveScriptId(
  input: OrchestratorInput,
  contentPort: ContentPort,
): Promise<string> {
  const scope = input.event.meta.source;
  const maybeRoutedPort = contentPort as RoutedContentPort;
  const rules = maybeRoutedPort.getRoutes ? await maybeRoutedPort.getRoutes(scope) : [];

  let selectedRule: RouteRule | null = null;
  let selectedPriority = Number.NEGATIVE_INFINITY;
  for (const rule of rules) {
    if (!routeMatches(rule, input)) continue;
    const priority = typeof rule.priority === 'number' ? rule.priority : 0;
    if (!selectedRule || priority > selectedPriority) {
      selectedRule = rule;
      selectedPriority = priority;
    }
  }

  if (selectedRule) return selectedRule.scriptId;

  // TODO remove after routes rollout
  return `${input.event.meta.source}:${input.event.type}`;
}

export async function buildPlan(
  input: OrchestratorInput,
  deps: { contentPort: ContentPort; contextQueryPort: ContextQueryPort },
): Promise<OrchestratorPlan> {
  const scriptId = await resolveScriptId(input, deps.contentPort);
  const script = await deps.contentPort.getScript(scriptId) as ScriptShape | null;
  if (!script) return [];

  const baseVars = {
    event: input.event,
    context: input.context,
  } as Record<string, unknown>;

  const queryResults = await runContextQueries(script.conditions, baseVars, deps.contextQueryPort);
  const vars = {
    ...baseVars,
    queries: queryResults,
  };

  const steps: OrchestratorPlanStep[] = [];
  for (const [index, step] of script.steps.entries()) {
    const rawParams = isRecord(step.params) ? step.params : {};
    const when = isRecord(rawParams._when) ? (rawParams._when as StepWhen) : null;
    const paramsWithoutWhen = { ...rawParams };
    delete paramsWithoutWhen._when;
    if (when && !evaluateWhen(when, vars)) continue;

    const interpolated = toPlanStep({ ...step, params: paramsWithoutWhen }, input, index, vars);
    const payload = await resolveTemplateParams(interpolated.payload, deps.contentPort);
    steps.push({ ...interpolated, payload });
  }

  return steps;
}
