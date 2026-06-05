/**
 * Runtime reads from canonical `public.system_settings` (unified DB).
 * Integrator mirror (`integrator.system_settings`) is not a runtime source of truth.
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export type PublicSystemSettingScope = 'global' | 'doctor' | 'admin';

export const publicSystemSettingScopeSchema = z.enum(['global', 'doctor', 'admin']);

/** Wrapper shape stored in the `value_json` column. */
export const systemSettingValueEnvelopeSchema = z
  .object({
    value: z.unknown(),
  })
  .passthrough();

export function extractSystemSettingInnerValue(valueJson: unknown): unknown {
  const parsed = systemSettingValueEnvelopeSchema.safeParse(valueJson);
  if (!parsed.success) return undefined;
  return parsed.data.value;
}

/** Trimmed non-empty string from envelope inner scalar (string / boolean / finite number). */
export const systemSettingStringInnerSchema = z.union([
  z.string().transform((s) => {
    const t = s.trim();
    return t.length > 0 ? t : null;
  }),
  z.boolean().transform((b) => (b ? 'true' : 'false')),
  z.number().finite().transform((n) => String(n)),
]);

export function parseSystemSettingStringValue(valueJson: unknown): string | null {
  const inner = extractSystemSettingInnerValue(valueJson);
  if (inner === undefined || inner === null) return null;
  const parsed = systemSettingStringInnerSchema.safeParse(inner);
  return parsed.success ? parsed.data : null;
}

/** True only for boolean `true` or string `'true'` (fail-safe admin flags). */
export const systemSettingTrueLiteralSchema = z.union([z.literal(true), z.literal('true')]);

export function parseSystemSettingTrueLiteral(valueJson: unknown): boolean {
  const inner = extractSystemSettingInnerValue(valueJson);
  return systemSettingTrueLiteralSchema.safeParse(inner).success;
}

export function parseSystemSettingInnerWithSchema<T>(
  valueJson: unknown,
  innerSchema: z.ZodType<T>,
): T | null {
  const inner = extractSystemSettingInnerValue(valueJson);
  const parsed = innerSchema.safeParse(inner);
  return parsed.success ? parsed.data : null;
}

export async function fetchPublicSystemSettingValueJson(
  db: DbPort,
  key: string,
  scope: PublicSystemSettingScope = 'admin',
): Promise<unknown | null> {
  const res = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT value_json FROM public.system_settings WHERE key = ${key} AND scope = ${scope} LIMIT 1`,
  );
  const row = res.rows[0];
  if (!row) return null;
  return row.value_json;
}

export async function readPublicSystemSettingString(
  db: DbPort,
  key: string,
  scope: PublicSystemSettingScope = 'admin',
): Promise<string | null> {
  const valueJson = await fetchPublicSystemSettingValueJson(db, key, scope);
  if (valueJson === null) return null;
  return parseSystemSettingStringValue(valueJson);
}
