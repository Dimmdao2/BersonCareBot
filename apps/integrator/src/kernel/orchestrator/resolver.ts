/**
 * Выбор сценария по входящему событию и построение плана шагов.
 * Сравнивает событие и контекст с условиями сценариев из контента, выбирает один сценарий
 * (по приоритету и точности совпадения), подставляет переменные в параметры шагов и возвращает
 * последовательность действий (отправка сообщения, установка состояния и т.д.).
 */

import type {
  ContentPort,
  ContentScript,
  ContentSelectionScope,
  ContextQueryPort,
  ContextQuery,
  OrchestratorInput,
  OrchestratorPlan,
  OrchestratorPlanStep,
} from '../contracts/index.js';
import { logger } from '../../infra/observability/logger.js';

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

type ScriptStep = {
  action: string;
  mode?: 'sync' | 'async';
  params?: Record<string, unknown>;
};

type ScriptShape = {
  id: ContentScript['id'];
  source?: ContentScript['source'];
  event?: ContentScript['event'];
  enabled?: ContentScript['enabled'];
  priority?: ContentScript['priority'];
  match?: ContentScript['match'];
  steps: ScriptStep[];
  conditions?: ContentScript['conditions'];
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
  if (typeof when.truthy === 'boolean') return when.truthy ? !!value : !value;
  if (Object.prototype.hasOwnProperty.call(when, 'equals')) return value === when.equals;
  if (Object.prototype.hasOwnProperty.call(when, 'notEquals')) return value !== when.notEquals;
  if (Array.isArray(when.in)) return when.in.includes(value as never);
  return Boolean(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isTruthyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Собирает из события и контекста переменные для сравнения с условиями сценария (действие, текст, состояние пользователя и т.д.). */
function normalizeMatchVars(input: OrchestratorInput): Record<string, unknown> {
  const eventPayload = asRecord(input.event.payload) ?? {};
  const normalizedInput = asRecord(eventPayload.incoming) ?? eventPayload;
  const facts = asRecord(input.context.facts) ?? {};
  const ctx = input.context as Record<string, unknown>;
  const conversationState = isTruthyString(normalizedInput.userState)
    ? normalizedInput.userState
    : (isTruthyString(ctx.conversationState) ? ctx.conversationState : undefined);
  const actor = {
    ...(asRecord(input.context.actor) ?? {}),
    ...(typeof normalizedInput.channelUserId === 'number' || isTruthyString(normalizedInput.channelUserId)
      ? { channelUserId: normalizedInput.channelUserId }
      : {}),
    ...(typeof normalizedInput.channelId === 'string' ? { channelUserId: normalizedInput.channelId } : {}),
    ...(typeof normalizedInput.chatId === 'number' ? { chatId: normalizedInput.chatId } : {}),
    ...(typeof normalizedInput.channelUsername === 'string' ? { username: normalizedInput.channelUsername } : {}),
    ...(conversationState ? { userState: conversationState } : {}),
  };
  const context = {
    ...input.context,
    ...(conversationState ? { conversationState } : {}),
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
    facts,
  };
}

function countSpecificity(match: unknown): number {
  if (Array.isArray(match)) return match.reduce((sum, item) => sum + countSpecificity(item), 0);
  if (!isRecord(match)) return 1;
  return Object.entries(match).reduce((sum, [key, value]) => {
    if (key === 'excludeActions' || key === 'excludeTexts' || key === 'excludeTextPrefixes') {
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

  /** Match when actual is not in the given array (e.g. exclude diary awaiting states from "any text" scripts). */
  const notIn = expected.$notIn;
  if (Array.isArray(notIn) && Object.keys(expected).length === 1) {
    return !notIn.includes(actual as never);
  }

  const startsWith = expected.$startsWith;
  if (typeof startsWith === 'string' && Object.keys(expected).length === 1) {
    return typeof actual === 'string' && actual.startsWith(startsWith);
  }

  const actualRecord = asRecord(actual) ?? {};
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'textPresent') {
      const hasText = isTruthyString(actualRecord.text);
      if (Boolean(value) !== hasText) return false;
      continue;
    }
    /** True when message has text or a relay type (voice, photo, etc.) — used for admin reply to accept media. */
    if (key === 'relayContentPresent') {
      const hasText = isTruthyString(actualRecord.text);
      const hasRelayType = isTruthyString(actualRecord.relayMessageType);
      const present = hasText || hasRelayType;
      if (Boolean(value) !== present) return false;
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
    if (key === 'excludeTextPrefixes') {
      if (!Array.isArray(value)) return false;
      const text = typeof actualRecord.text === 'string' ? actualRecord.text.trim() : '';
      if (value.some((prefix: unknown) => typeof prefix === 'string' && text.startsWith(prefix))) return false;
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
    const singlePlaceholder = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (singlePlaceholder) {
      const key = singlePlaceholder[1];
      if (typeof key !== 'string') return '';
      const replacement = getPathValue(vars, key);
      return replacement === undefined ? '' : replacement;
    }
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
    const varsWithQueries = { ...vars, queries: results };
    const query = interpolate(item.query, varsWithQueries) as ContextQuery;
    if (!isRecord(query) || typeof query.type !== 'string') continue;
    results[name] = await contextQueryPort.request(query);
  }
  return results;
}

function toPlanStep(step: ScriptStep, input: OrchestratorInput, index: number, vars: Record<string, unknown>): OrchestratorPlanStep {
  const interpolated = interpolate(step.params ?? {}, vars) as Record<string, unknown>;
  // Логгирование параметров шага для callback-сценариев (debug, уровень LOG_LEVEL)
  if (input.event.type === 'callback.received') {
    logger.debug(
      { stepIndex: index, action: step.action, params: interpolated },
      '[orchestrator][toPlanStep]',
    );
  }
  return {
    id: `step:${input.event.meta.eventId}:${index}`,
    kind: step.action,
    mode: step.mode ?? 'sync',
    payload: interpolated,
  };
}

function buildContentScope(input: OrchestratorInput): ContentSelectionScope {
  return {
    source: input.event.meta.source,
    audience: input.context.actor.isAdmin === true ? 'admin' : 'user',
  };
}

async function resolveBusinessScript(
  input: OrchestratorInput,
  contentPort: ContentPort,
): Promise<SelectedScript | null> {
  const source = input.event.meta.source;
  const scope = buildContentScope(input);

  const scripts: ScriptShape[] = contentPort.getScripts
    ? ((await contentPort.getScripts(scope)) as ScriptShape[])
    : (contentPort.getScriptsBySource ? (await contentPort.getScriptsBySource(source)) as ScriptShape[] : []);

  if (scripts.length === 0) return null;

  let selected: SelectedScript | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const defaultPriority = 0;

  for (const script of scripts) {
    const { matched, specificity } = scriptMatches(script, input);
    if (!matched) continue;
    const priority = typeof script.priority === 'number' ? script.priority : defaultPriority;
    const score = priority * 1e6 + specificity;
    if (!selected || score > bestScore) {
      selected = { scriptId: `${source}:${script.id}`, script };
      bestScore = score;
    }
  }

  return selected;
}

/**
 * Prod: inline callbacks without a linked phone must not run notification/booking/diary scripts.
 * Single gate before script matching — same UX as `*.need_phone` scenarios (request contact + `callback.answer`).
 * Skips admins. Falls through when `callbackQueryId` is missing (non-standard payload) or source is not telegram/max.
 */
function buildLinkedPhoneCallbackGatePlan(input: OrchestratorInput): OrchestratorPlan | null {
  if (input.event.type !== 'callback.received') return null;
  if (input.context.actor?.isAdmin === true) return null;
  if (input.context.linkedPhone === true) return null;

  const vars = normalizeMatchVars(input);
  const inc = asRecord(vars.input) ?? {};
  const callbackQueryId = typeof inc.callbackQueryId === 'string' ? inc.callbackQueryId.trim() : '';
  if (!callbackQueryId) return null;

  const source = input.event.meta.source;
  const scriptSteps: ScriptStep[] =
    source === 'max'
      ? [
          {
            action: 'user.state.set',
            mode: 'sync',
            params: {
              channelUserId: '{{actor.channelUserId}}',
              state: 'await_contact:subscription',
            },
          },
          {
            action: 'message.send',
            mode: 'async',
            params: {
              recipient: { chatId: '{{actor.chatId}}' },
              templateKey: 'max:confirmPhoneForBooking',
              delivery: { channels: ['max'], maxAttempts: 1 },
              inlineKeyboard: [[{ textTemplateKey: 'max:requestContact.button', requestPhone: true }]],
            },
          },
          {
            action: 'callback.answer',
            mode: 'async',
            params: { callbackQueryId: '{{input.callbackQueryId}}' },
          },
        ]
      : source === 'telegram'
        ? [
            {
              action: 'user.state.set',
              mode: 'sync',
              params: {
                channelUserId: '{{actor.channelUserId}}',
                state: 'await_contact:subscription',
              },
            },
            {
              action: 'message.replyKeyboard.show',
              mode: 'async',
              params: {
                chatId: '{{actor.chatId}}',
                templateKey: 'telegram:confirmPhoneForBooking',
                keyboard: [[{ textTemplateKey: 'telegram:requestContact.button', requestPhone: true }]],
                resizeKeyboard: true,
                oneTimeKeyboard: true,
              },
            },
            {
              action: 'callback.answer',
              mode: 'async',
              params: { callbackQueryId: '{{input.callbackQueryId}}' },
            },
          ]
        : [];

  if (scriptSteps.length === 0) return null;

  return scriptSteps.map((step, index) => toPlanStep(step, input, index, vars));
}

/** Выбирает подходящий сценарий, подставляет переменные в шаги и возвращает план действий. */
export async function buildPlan(
  input: OrchestratorInput,
  deps: { contentPort: ContentPort; contextQueryPort: ContextQueryPort },
): Promise<OrchestratorPlan> {
  if (input.event.type === 'callback.received') {
    logger.debug({ input }, '[orchestrator][buildPlan] input');
  }
  const gated = buildLinkedPhoneCallbackGatePlan(input);
  if (gated !== null) return gated;

  const selected = await resolveBusinessScript(input, deps.contentPort);
  if (!selected) return [];
  const script = selected.script;
  const scope = buildContentScope(input);
  const bundle = deps.contentPort.getBundle ? await deps.contentPort.getBundle(scope) : null;

  const baseVars = {
    event: input.event,
    context: input.context,
    ...normalizeMatchVars(input),
  } as Record<string, unknown>;
  if (input.event.type === 'callback.received') {
    logger.debug({ baseVars }, '[orchestrator][buildPlan] baseVars');
  }

  const queryResults = await runContextQueries(script.conditions, baseVars, deps.contextQueryPort);
  const vars = {
    ...baseVars,
    queries: queryResults,
  };
  if (input.event.type === 'callback.received') {
    logger.debug({ vars }, '[orchestrator][buildPlan] vars after queries');
  }

  const steps: OrchestratorPlanStep[] = [];
  for (const [index, step] of script.steps.entries()) {
    const rawParams = isRecord(step.params) ? step.params : {};
    const when = isRecord(rawParams._when) ? (rawParams._when as StepWhen) : null;
    const paramsWithoutWhen = { ...rawParams };
    delete paramsWithoutWhen._when;
    if (when && !evaluateWhen(when, vars)) continue;

    let stepResult = toPlanStep({ ...step, params: paramsWithoutWhen }, input, index, vars);
    const payload = stepResult.payload as Record<string, unknown> | undefined;
    if (bundle?.menus && payload && typeof payload.menu === 'string') {
      const menuId = payload.menu;
      const menuKeyboard = isRecord(bundle.menus[menuId]) || Array.isArray(bundle.menus[menuId]) ? bundle.menus[menuId] : undefined;
      if (menuKeyboard !== undefined) {
        payload.inlineKeyboard = menuKeyboard;
        delete payload.menu;
      }
    }
    if (input.event.type === 'callback.received') {
      logger.debug({ stepIndex: index, stepResult }, '[orchestrator][buildPlan] step interpolated');
    }
    steps.push(stepResult);
  }

  return steps;
}
