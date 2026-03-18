/** Режим выполнения шага скрипта. */
export type StepMode = 'sync' | 'async';

/** Статус результата выполнения шага. */
export type StepStatus = 'success' | 'failed' | 'queued' | 'skipped';

/** Универсальный шаг скрипта, который исполняет domain.executeStep. */
export type Step = {
  id: string;
  kind: string;
  mode: StepMode;
  payload: Record<string, unknown>;
};

/** Результат выполнения одного шага скрипта. */
export type StepResult = {
  stepId: string;
  status: StepStatus;
  data?: Record<string, unknown>;
  error?: string;
};
