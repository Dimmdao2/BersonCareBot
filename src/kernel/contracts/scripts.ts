import type { IncomingEvent } from './events.js';
import type { Step } from './steps.js';

/** Идентификатор скрипта оркестратора. */
export type ScriptId = string;

/** Контекст выполнения скрипта. */
export type ScriptContext = {
  event: IncomingEvent;
  values: Record<string, unknown>;
};

/** Контракт скрипта как последовательности шагов. */
export type Script = {
  id: ScriptId;
  steps: Step[];
};
