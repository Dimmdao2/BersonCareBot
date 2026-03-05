import type { IncomingEvent, OutgoingIntent } from './events.js';
import type { DbWriteMutation } from './ports.js';

/** Контекст доменной обработки входящего события. */
export type DomainContext = {
  event: IncomingEvent;
  nowIso: string;
  values: Record<string, unknown>;
  user?: {
    id?: string;
    telegramId?: string;
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

/** Отложенная задача доставки/выполнения для runtime/queue. */
export type DeliveryJob = {
  id: string;
  kind: string;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
};

/** Результат выполнения одной доменной команды. */
export type ActionResult = {
  actionId: string;
  status: 'success' | 'failed' | 'queued' | 'skipped';
  writes?: DbWriteMutation[];
  intents?: OutgoingIntent[];
  jobs?: DeliveryJob[];
  error?: string;
};
