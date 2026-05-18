/**
 * Resolved outbound SMTP used by `/api/bersoncare/send-email`.
 * Priority: DB `smtp_outbound` (admin) when «complete», else legacy env via `integrations/email/config.js`.
 */
import type { DbPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { emailConfig } from '../integrations/email/config.js';

const KEY = 'smtp_outbound';
const ADMIN_SCOPE = 'admin';
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

function fromEnvFallback(): ResolvedSmtpOutboundConfig {
  if (!emailConfig.configured) return emptyResolved();
  return {
    configured: true,
    smtpHost: emailConfig.smtpHost,
    smtpPort: emailConfig.smtpPort,
    smtpSecure: emailConfig.smtpSecure,
    smtpUser: emailConfig.smtpUser,
    smtpPass: emailConfig.smtpPass,
    fromAddress: emailConfig.fromAddress,
  };
}

function parseInner(valueJson: unknown): ResolvedSmtpOutboundConfig | null {
  let inner: unknown = null;
  if (valueJson !== null && typeof valueJson === 'object' && 'value' in (valueJson as Record<string, unknown>)) {
    inner = (valueJson as Record<string, unknown>).value;
  }
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
  const o = inner as Record<string, unknown>;
  const host = typeof o.host === 'string' ? o.host.trim() : '';
  const user = typeof o.user === 'string' ? o.user.trim() : '';
  const pass = typeof o.password === 'string' ? o.password : '';
  const from = typeof o.from === 'string' ? o.from.trim() : '';
  let port = 587;
  if (typeof o.port === 'number' && Number.isFinite(o.port)) port = Math.min(65535, Math.max(1, Math.round(o.port)));
  else if (typeof o.port === 'string' && /^\d+$/.test(o.port.trim())) {
    const n = Number.parseInt(o.port.trim(), 10);
    if (Number.isFinite(n)) port = Math.min(65535, Math.max(1, n));
  }
  let smtpSecure = false;
  if (o.secure === true || o.secure === 1 || o.secure === '1' || o.secure === 'true') smtpSecure = true;
  if (smtpSecure === false && port === 465) smtpSecure = true;

  if (!host.length || !user.length || !pass.trim().length || !from.length) return null;

  return {
    configured: true,
    smtpHost: host,
    smtpPort: port,
    smtpSecure,
    smtpUser: user,
    smtpPass: pass.trim(),
    fromAddress: from,
  };
}

/** Async resolve with TTL cache; invalid after settings sync (`invalidateSmtpOutboundCache`). */
export async function resolveSmtpOutboundConfig(db: DbPort): Promise<ResolvedSmtpOutboundConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.cfg;

  let resolved: ResolvedSmtpOutboundConfig;
  try {
    const res = await db.query<{ value_json: unknown }>(
      `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 LIMIT 1`,
      [KEY, ADMIN_SCOPE],
    );
    const row = res.rows[0]?.value_json;
    const fromDb = row != null ? parseInner(row) : null;
    resolved = fromDb ?? fromEnvFallback();
  } catch (err) {
    logger.warn({ err, key: KEY }, '[smtpOutbound] query failed, env fallback');
    resolved = fromEnvFallback();
  }

  cache = { cfg: resolved, expiresAt: now + TTL_MS };
  return resolved;
}
