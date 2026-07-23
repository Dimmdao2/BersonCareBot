/**
 * Resolved outbound SMTP used by `/api/bersoncare/send-email`.
 * Source of truth: restricted DB-backed `public.system_settings.smtp_outbound` (admin).
 * The delivery process receives only an argumentless database capability for this credential.
 */
import { z } from 'zod';
import type { DbPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { parseSystemSettingInnerWithSchema } from '../infra/db/publicSystemSettings.js';
import { readSmtpOutboundSettingValueJson } from '../infra/db/publicRestrictedSettings.js';

const KEY = 'smtp_outbound';
const TTL_MS = 60_000;

export type ResolvedSmtpOutboundConfig = {
  configured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
};

type CacheEntry = { cfg: ResolvedSmtpOutboundConfig; expiresAt: number };
let cache: CacheEntry | null = null;

const smtpPortInnerSchema = z.preprocess((v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
  return 587;
}, z.number().int().min(1).max(65535));

const smtpSecureInnerSchema = z.preprocess(
  (v) => v === true || v === 1 || v === '1' || v === 'true',
  z.boolean(),
);

const smtpOutboundInnerReadSchema = z
  .object({
    host: z.string().trim().min(1),
    user: z.string().trim().min(1),
    password: z.string().min(1),
    from: z.string().trim().min(1),
    port: smtpPortInnerSchema.optional(),
    secure: smtpSecureInnerSchema.optional(),
  })
  .transform((o) => {
    const port = o.port ?? 587;
    let smtpSecure = o.secure ?? false;
    if (!smtpSecure && port === 465) smtpSecure = true;
    return {
      configured: true as const,
      smtpHost: o.host,
      smtpPort: port,
      smtpSecure,
      smtpUser: o.user,
      smtpPass: o.password.trim(),
      fromAddress: o.from,
    };
  });

export function invalidateSmtpOutboundCache(): void {
  cache = null;
}

function emptyResolved(): ResolvedSmtpOutboundConfig {
  return {
    configured: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    fromAddress: '',
  };
}

function parseSmtpOutboundValueJson(valueJson: unknown): ResolvedSmtpOutboundConfig | null {
  return parseSystemSettingInnerWithSchema(valueJson, smtpOutboundInnerReadSchema);
}

/** Async resolve with TTL cache; invalid after settings sync (`invalidateSmtpOutboundCache`). */
export async function resolveSmtpOutboundConfig(db: DbPort): Promise<ResolvedSmtpOutboundConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.cfg;

  let resolved: ResolvedSmtpOutboundConfig;
  try {
    const valueJson = await readSmtpOutboundSettingValueJson(db);
    const fromDb = valueJson !== null ? parseSmtpOutboundValueJson(valueJson) : null;
    resolved = fromDb ?? emptyResolved();
  } catch {
    logger.warn(
      { key: KEY, reason: 'restricted_setting_read_failed' },
      '[smtpOutbound] restricted DB setting unavailable',
    );
    resolved = emptyResolved();
  }

  cache = { cfg: resolved, expiresAt: now + TTL_MS };
  return resolved;
}
