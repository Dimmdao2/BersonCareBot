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
  source?: string;
  event?: string;
  enabled?: boolean;
  priority?: number;
  match?: Record<string, unknown>;
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
  scriptId?: string;
};

type SelectedScript = {
  scriptId: string;
  script: ScriptShape;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isTruthyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeMatchVars(input: OrchestratorInput): Record<string, unknown> {
  const eventPayload = asRecord(input.event.payload) ?? {};
  const normalizedInput = asRecord(eventPayload.incoming) ?? eventPayload;
  const actor = {
    ...(asRecord(input.context.actor) ?? {}),
    ...(typeof normalizedInput.channelUserId === 'number' || isTruthyString(normalizedInput.channelUserId)
      ? { channelUserId: normalizedInput.channelUserId }
      : {}),
    ...(typeof normalizedInput.channelId === 'string' ? { channelUserId: normalizedInput.channelId } : {}),
    ...(typeof normalizedInput.chatId === 'number' ? { chatId: normalizedInput.chatId } : {}),
    ...(typeof normalizedInput.channelUsername === 'string' ? { username: normalizedInput.channelUsername } : {}),
  };
  const context = {
    ...input.context,
    ...(typeof normalizedInput.userState === 'string' ? { conversationState: normalizedInput.userState } : {}),
    ...(typeof normalizedInput.hasLinkedPhone === 'boolean' ? { linkedPhone: normalizedInput.hasLinkedPhone } : {}),
  };

  return {
    source: input.event.meta.source,
    event: input.event.type,
    meta: input.event.meta,
    payload: input.event.payload,
    input: normalizedInput,
    actor,
    context,
  };
}

function countSpecificity(match: unknown): number {
  if (Array.isArray(match)) return match.reduce((sum, item) => sum + countSpecificity(item), 0);
  if (!isRecord(match)) return 1;
  return Object.entries(match).reduce((sum, [key, value]) => {
    if (key === 'excludeActions' || key === 'excludeTexts') {
      return sum + (Array.isArray(value) ? value.length : 1);
    }
    return sum + 1 + countSpecificity(value);
  }, 0);
}

function matchesScriptPattern(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    return expected.every((item, index) => matchesScriptPattern(actual[index], item));
  }

  if (!isRecord(expected)) return actual === expected;

  const actualRecord = asRecord(actual) ?? {};
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'textPresent') {
      const hasText = isTruthyString(actualRecord.text);
      if (Boolean(value) !== hasText) return false;
      continue;
    }
    if (key === 'phonePresent') {
      const hasPhone = isTruthyString(actualRecord.phone) || isTruthyString(actualRecord.contactPhone);
      if (Boolean(value) !== hasPhone) return false;
      continue;
    }
    if (key === 'excludeActions') {
      if (!Array.isArray(value)) return false;
      if (value.includes(actualRecord.action as never)) return false;
      continue;
    }
    if (key === 'excludeTexts') {
      if (!Array.isArray(value)) return false;
      if (value.includes(actualRecord.text as never)) return false;
      continue;
    }
    if (!matchesScriptPattern(actualRecord[key], value)) return false;
  }
  return true;
}

function scriptMatches(script: ScriptShape, input: OrchestratorInput): { matched: boolean; specificity: number } {
  if (script.enabled === false) return { matched: false, specificity: Number.NEGATIVE_INFINITY };
  if (typeof script.source === 'string' && script.source !== input.event.meta.source) {
    return { matched: false, specificity: Number.NEGATIVE_INFINITY };
  }
  if (typeof script.event === 'string' && script.event !== input.event.type) {
    return { matched: false, specificity: Number.NEGATIVE_INFINITY };
  }

  const match = isRecord(script.match) ? script.match : null;
  if (!match) {
    return { matched: true, specificity: 0 };
  }

  const vars = normalizeMatchVars(input);
  return {
    matched: matchesScriptPattern(vars, match),
    specificity: countSpecificity(match),
  };
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
): Promise<string | null> {
  const scope = input.event.meta.source;
  const rules = contentPort.getRoutes ? await contentPort.getRoutes(scope) as RouteRule[] : [];

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

  if (selectedRule?.scriptId) return selectedRule.scriptId;
  return null;
}

async function resolveBusinessScript(
  input: OrchestratorInput,
  contentPort: ContentPort,
  routeScriptId: string,
): Promise<SelectedScript | null> {
  if (!contentPort.getScriptsBySource) {
    const script = await contentPort.getScript(routeScriptId) as ScriptShape | null;
    return script ? { scriptId: routeScriptId, script } : null;
  }

  const source = input.event.meta.source;
  const scripts = (await contentPort.getScriptsBySource(source)) as ScriptShape[];
  let selected: SelectedScript | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const script of scripts) {
    const { matched, specificity } = scriptMatches(script, input);
    if (!matched) continue;
    if (!selected || specificity > bestScore) {
      selected = { scriptId: `${source}:${script.id}`, script };
      bestScore = specificity;
    }
  }

  if (selected) return selected;

  const fallbackScript = await contentPort.getScript(routeScriptId) as ScriptShape | null;
  return fallbackScript ? { scriptId: routeScriptId, script: fallbackScript } : null;
}

export async function buildPlan(
  input: OrchestratorInput,
  deps: { contentPort: ContentPort; contextQueryPort: ContextQueryPort },
): Promise<OrchestratorPlan> {
  const routeScriptId = await resolveScriptId(input, deps.contentPort);
  if (!routeScriptId) return [];
  const selected = await resolveBusinessScript(input, deps.contentPort, routeScriptId);
  if (!selected) return [];
  const script = selected.script;

  const baseVars = {
    event: input.event,
    context: input.context,
    ...normalizeMatchVars(input),
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
