import type { BaseContext } from './orchestrator.js';
import type { IncomingEvent, OutgoingIntent } from './events.js';
import type { DbWriteMutation } from './ports.js';

/** Контекст доменной обработки входящего события. */
export type DomainContext = {
  event: IncomingEvent;
  nowIso: string;
  values: Record<string, unknown>;
  base: BaseContext;
  user?: {
    id?: string;
    channelId?: string;
    phoneNormalized?: string | null;
    isAdmin?: boolean;
    channels?: string[];
  };
};

/** Шаг сценария, который возвращает orchestrator. */
export type ScriptStep = {
  id: string;
  action: string;
  mode: 'sync' | 'async';
  params: Record<string, unknown>;
};

/** Универсальная доменная команда для executor. */
export type Action = {
  id: string;
  type: string;
  mode: 'sync' | 'async';
  params: Record<string, unknown>;
};

export type DeliveryTarget = {
  resource: string;
  address: Record<string, unknown>;
};

export type DeliveryPlanStage = {
  stageId: string;
  channel: string;
  maxAttempts: number;
};

export type DeliveryRetryPolicy = {
  maxAttempts: number;
  backoffSeconds: number[];
  deadlineAt?: string;
};

export type DeliveryFailPolicy = {
  adminNotifyIntent?: OutgoingIntent;
};

/** Отложенная задача доставки/выполнения для runtime/queue. */
export type DeliveryJob = {
  id: string;
  kind: string;
  jobId?: string;
  tenantId?: string | null;
  createdAt?: string;
  status?: 'pending' | 'processing' | 'done' | 'dead';
  attemptsMade?: number;
  plan?: DeliveryPlanStage[];
  targets?: DeliveryTarget[];
  retry?: DeliveryRetryPolicy;
  onFail?: DeliveryFailPolicy;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
};

/** Технический результат одной попытки доставки в runtime. */
export type DeliveryAttemptResult = {
  ok: boolean;
  errorCode?: string;
  nextRunAt?: string;
  final?: boolean;
};

/** Результат выполнения одной доменной команды. */
export type ActionResult = {
  actionId: string;
  status: 'success' | 'failed' | 'queued' | 'skipped';
  /** Остановить оставшиеся шаги сценария без статуса `failed` (например конфликт привязки телефона). */
  abortPlan?: boolean;
  values?: Record<string, unknown>;
  writes?: DbWriteMutation[];
  intents?: OutgoingIntent[];
  jobs?: DeliveryJob[];
  error?: string;
};
