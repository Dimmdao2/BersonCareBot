import { z } from 'zod';
import { createDbPort } from '../infra/db/client.js';
import { logger } from '../infra/observability/logger.js';
import {
  fetchOperatorHealthProbeConfigValueJson,
  fetchPublicSystemSettingValueJson,
  parseSystemSettingInnerWithSchema,
} from '../infra/db/publicSystemSettings.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../infra/db/withClient.js';

export const OPERATOR_HEALTH_PROBE_CONFIG_KEY = 'operator_health_probe_config';
export const OPERATOR_HEALTH_PROBE_NAMES = ['max', 'telegram', 'google_calendar'] as const;
export type OperatorHealthProbeName = (typeof OPERATOR_HEALTH_PROBE_NAMES)[number];
export type OperatorHealthEmailProbeConfig = {
  intervalMs: number;
  timeoutMs: number;
  roundTripDeadlineMs: number;
  retentionMs: number;
  cleanupIntervalMs: number;
};
export type OperatorHealthProbeConfig = {
  [K in OperatorHealthProbeName]: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    consecutiveFailures: number;
  };
} & {
  email: OperatorHealthEmailProbeConfig;
  quietWindowMaxDurationMs: number;
  quietUntil: string | null;
};

/** Must match the registry default; the integrator cannot import webapp internals. */
export const DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG: OperatorHealthProbeConfig = {
  max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  telegram: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  google_calendar: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  email: {
    intervalMs: 900_000,
    timeoutMs: 60_000,
    roundTripDeadlineMs: 300_000,
    retentionMs: 604_800_000,
    cleanupIntervalMs: 86_400_000,
  },
  quietWindowMaxDurationMs: 86_400_000,
  quietUntil: null,
};

const probeSchema = z.object({
  enabled: z.boolean(),
  intervalMs: z.number().int().min(300_000).max(3_600_000),
  timeoutMs: z.number().int().min(1_000).max(60_000),
  consecutiveFailures: z.number().int().min(2).max(10),
});
const configSchema = z.object({
  max: probeSchema,
  telegram: probeSchema,
  google_calendar: probeSchema,
  email: z
    .object({
      intervalMs: z.number().int().min(300_000).max(3_600_000),
      timeoutMs: z.number().int().min(30_000).max(120_000),
      roundTripDeadlineMs: z.number().int().min(60_000).max(900_000),
      retentionMs: z.number().int().min(86_400_000).max(2_592_000_000),
      cleanupIntervalMs: z.number().int().min(86_400_000).max(604_800_000),
    })
    .default({
      intervalMs: 900_000,
      timeoutMs: 60_000,
      roundTripDeadlineMs: 300_000,
      retentionMs: 604_800_000,
      cleanupIntervalMs: 86_400_000,
    }),
  quietWindowMaxDurationMs: z.number().int().min(60_000).max(604_800_000).default(86_400_000),
  quietUntil: z.string().datetime({ offset: true }).nullable(),
});

export function isOperatorHealthProbeQuiet(
  config: OperatorHealthProbeConfig,
  now = new Date(),
): boolean {
  if (config.quietUntil === null) return false;
  const remainingMs = Date.parse(config.quietUntil) - now.getTime();
  return remainingMs > 0 && remainingMs <= config.quietWindowMaxDurationMs;
}

export function isOperatorHealthProbeDue(input: {
  lastRunAt: string | null;
  intervalMs: number;
  now: Date;
}): boolean {
  if (!input.lastRunAt) return true;
  const lastRunMs = Date.parse(input.lastRunAt);
  return !Number.isFinite(lastRunMs) || input.now.getTime() - lastRunMs >= input.intervalMs;
}

/** DB-backed config with fail-safe registry-equivalent defaults after a reset/delete. */
export async function getOperatorHealthProbeConfig(): Promise<OperatorHealthProbeConfig> {
  try {
    // Under an operational capability role (the scheduler tick) the settings table is out of
    // reach by design; its dedicated capability is the only path that is not a hard 42501.
    const db = createDbPort();
    const valueJson =
      getCurrentIntegratorTechnicalRuntimeRole() === undefined
        ? await fetchPublicSystemSettingValueJson(db, OPERATOR_HEALTH_PROBE_CONFIG_KEY, 'admin')
        : await fetchOperatorHealthProbeConfigValueJson(db);
    const parsed =
      valueJson === null ? null : parseSystemSettingInnerWithSchema(valueJson, configSchema);
    return parsed ?? DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG;
  } catch (err) {
    logger.warn(
      { err, key: OPERATOR_HEALTH_PROBE_CONFIG_KEY },
      'operator_health_probe_config_defaulted',
    );
    return DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG;
  }
}
