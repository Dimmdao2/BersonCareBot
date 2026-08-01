/**
 * Dead man's switch (design D-d) — чистое ядро.
 *
 * Механика: есть сигнал, который ОБЯЗАН приходить регулярно; алертом является его ОТСУТСТВИЕ.
 * Это ровно `Watchdog` из kube-prometheus (`vector(1)`, всегда firing — интеграция уведомляет,
 * когда алерт ПЕРЕСТАЛ гореть) и семантика Healthchecks.io («молчит, пока пинги приходят вовремя;
 * поднимает тревогу, как только пинг не пришёл в срок»).
 *
 * Два пульса:
 *  1. `pipeline_delivery` — бьётся только после ПОДТВЕРЖДЁННОЙ успешной доставки.
 *     Подтверждение = строка `outgoing_delivery_queue` перешла в `sent`; сдвиг ватермарки
 *     `lastSentAt` вперёд и есть событие «доставка жива».
 *  2. `digest` — бьётся, когда отработала суточная сводка. Сводка, которая не запустилась,
 *     выглядит ровно как тихий день, поэтому её собственный пульс обязателен.
 *
 * Принимающая сторона в проде обязана быть ВНЕШНЕЙ: пульс, который излучает наша же мёртвая
 * коробка, ничего не доказывает. Здесь реализована излучающая сторона и локальный приёмник,
 * который мы контролируем; внешний адрес подставляется конфигом (см. `externalPingUrlEnvVar`).
 */

export const OPERATOR_HEARTBEAT_JOB_FAMILY = 'heartbeat' as const;

export const OPERATOR_HEARTBEAT_NAMES = ['pipeline_delivery', 'digest'] as const;
export type OperatorHeartbeatName = (typeof OPERATOR_HEARTBEAT_NAMES)[number];

export function isOperatorHeartbeatName(value: string): value is OperatorHeartbeatName {
  return (OPERATOR_HEARTBEAT_NAMES as readonly string[]).includes(value);
}

export type OperatorHeartbeatDefinition = {
  name: OperatorHeartbeatName;
  jobKey: string;
  label: string;
  /** Переменная окружения с URL ВНЕШНЕГО приёмника (healthchecks-подобного). */
  externalPingUrlEnvVar: string;
};

export const OPERATOR_HEARTBEATS: readonly OperatorHeartbeatDefinition[] = [
  {
    name: 'pipeline_delivery',
    jobKey: 'heartbeat.pipeline_delivery',
    label: 'Пульс доставки (подтверждённая отправка)',
    externalPingUrlEnvVar: 'OPERATOR_HEARTBEAT_PIPELINE_URL',
  },
  {
    name: 'digest',
    jobKey: 'heartbeat.digest',
    label: 'Пульс суточной сводки',
    externalPingUrlEnvVar: 'OPERATOR_HEARTBEAT_DIGEST_URL',
  },
] as const;

export function findOperatorHeartbeat(name: string): OperatorHeartbeatDefinition | undefined {
  return OPERATOR_HEARTBEATS.find((h) => h.name === name);
}

/** Ключ `system_settings` с переопределением порогов: `{"pipeline_delivery": 900}`. */
export const OPERATOR_HEARTBEAT_CONFIG_KEY = 'operator_heartbeat_config';

export type OperatorHeartbeatStaleOverrides = Record<OperatorHeartbeatName, number>;

/** Both mutable thresholds must be present in the DB-backed configuration. */
export function parseOperatorHeartbeatStaleOverrides(
  raw: string | null | undefined,
): OperatorHeartbeatStaleOverrides {
  const text = (raw ?? '').trim();
  if (!text) throw new Error('runtime_setting_unavailable:operator_heartbeat_config');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('runtime_setting_unavailable:operator_heartbeat_config');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('runtime_setting_unavailable:operator_heartbeat_config');
  }
  const out = {} as OperatorHeartbeatStaleOverrides;
  for (const key of OPERATOR_HEARTBEAT_NAMES) {
    const value = (parsed as Record<string, unknown>)[key];
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('runtime_setting_unavailable:operator_heartbeat_config');
    }
    out[key] = Math.floor(n);
  }
  return out;
}

export function resolveHeartbeatStaleAfterSec(
  definition: OperatorHeartbeatDefinition,
  overrides: OperatorHeartbeatStaleOverrides,
): number {
  return overrides[definition.name];
}

export type OperatorHeartbeatObservation = {
  name: OperatorHeartbeatName;
  /** ISO последнего пульса; `null` — пульса не было НИКОГДА (тоже отсутствие). */
  lastPingAt: string | null;
  staleAfterSec: number;
};

export type OperatorHeartbeatVerdict = {
  name: OperatorHeartbeatName;
  label: string;
  status: 'alive' | 'absent' | 'never';
  lastPingAt: string | null;
  ageSeconds: number | null;
  staleAfterSec: number;
};

/**
 * Классификация ОТСУТСТВИЯ пульса.
 *
 * `never` (строки нет вообще) намеренно НЕ считается «пока рано»: пульс, который ни разу не
 * пришёл, — это не «нет данных», а «механизм не работает». Молчание не бывает зелёным.
 */
export function classifyOperatorHeartbeat(
  observation: OperatorHeartbeatObservation,
  nowMs: number = Date.now(),
): OperatorHeartbeatVerdict {
  const definition = findOperatorHeartbeat(observation.name);
  const label = definition?.label ?? observation.name;
  if (!observation.lastPingAt) {
    return {
      name: observation.name,
      label,
      status: 'never',
      lastPingAt: null,
      ageSeconds: null,
      staleAfterSec: observation.staleAfterSec,
    };
  }
  const t = Date.parse(observation.lastPingAt);
  if (!Number.isFinite(t)) {
    return {
      name: observation.name,
      label,
      status: 'never',
      lastPingAt: observation.lastPingAt,
      ageSeconds: null,
      staleAfterSec: observation.staleAfterSec,
    };
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - t) / 1000));
  return {
    name: observation.name,
    label,
    status: ageSeconds > observation.staleAfterSec ? 'absent' : 'alive',
    lastPingAt: observation.lastPingAt,
    ageSeconds,
    staleAfterSec: observation.staleAfterSec,
  };
}

export function isHeartbeatFailing(verdict: OperatorHeartbeatVerdict): boolean {
  return verdict.status !== 'alive';
}

export function formatHeartbeatAge(verdict: OperatorHeartbeatVerdict): string {
  if (verdict.ageSeconds == null) return 'пульса не было ни разу';
  const minutes = Math.floor(verdict.ageSeconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} сут назад`;
}
