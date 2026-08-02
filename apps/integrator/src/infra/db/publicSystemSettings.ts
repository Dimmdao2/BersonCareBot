/**
 * Runtime reads from canonical `public.system_settings` (unified DB).
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export type PublicSystemSettingScope = 'global' | 'doctor' | 'admin';
export type PublicSystemSettingsReadOptions = {
  organizationId?: string | null;
};

export type IntegratorProviderRuntimeSettingKey =
  | 'telegram_bot_token'
  | 'telegram_webhook_secret'
  | 'telegram_send_menu_on_button_press'
  | 'max_bot_api_key'
  | 'max_webhook_secret'
  | 'max_api_base_url'
  | 'smsc_enabled'
  | 'smsc_api_key'
  | 'smsc_base_url';

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
  z
    .number()
    .finite()
    .transform((n) => String(n)),
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
  options: PublicSystemSettingsReadOptions = {},
): Promise<unknown | null> {
  const organizationId = options.organizationId?.trim() || null;
  const res = organizationId
    ? await runIntegratorSql<{ value_json: unknown }>(
        db,
        sql`SELECT value_json
            FROM public.system_settings
            WHERE key = ${key}
              AND scope = ${scope}
              AND (organization_id = ${organizationId}::uuid OR organization_id IS NULL)
            ORDER BY organization_id IS NULL ASC
            LIMIT 1`,
      )
    : await runIntegratorSql<{ value_json: unknown }>(
        db,
        sql`SELECT value_json
            FROM public.system_settings
            WHERE key = ${key} AND scope = ${scope} AND organization_id IS NULL
            LIMIT 1`,
      );
  const row = res.rows[0];
  if (!row) return null;
  return row.value_json;
}

/**
 * Global provider configuration through the DB-owned fixed allowlist capability.
 * The integrator runtime login receives EXECUTE on the function, never table SELECT.
 */
export async function fetchIntegratorProviderRuntimeSettingValueJson(
  db: DbPort,
  key: IntegratorProviderRuntimeSettingKey,
): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_provider_runtime_setting(${key}) AS value_json`,
  );
  const row = result.rows[0];
  return row?.value_json ?? null;
}

export async function readPublicSystemSettingString(
  db: DbPort,
  key: string,
  scope: PublicSystemSettingScope = 'admin',
  options: PublicSystemSettingsReadOptions = {},
): Promise<string | null> {
  const valueJson = await fetchPublicSystemSettingValueJson(db, key, scope, options);
  if (valueJson === null) return null;
  return parseSystemSettingStringValue(valueJson);
}

/** Exact organization row; used for clinic-owned external account credentials. */
export async function readExactOrganizationPublicSystemSettingString(
  db: DbPort,
  key: string,
  organizationId: string,
): Promise<string | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return null;
  const res = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT value_json
        FROM public.system_settings
        WHERE key = ${key}
          AND scope = 'admin'
          AND organization_id = ${normalizedOrganizationId}::uuid
        LIMIT 1`,
  );
  return res.rows[0] ? parseSystemSettingStringValue(res.rows[0].value_json) : null;
}

/** Exact organization row, preserving the setting envelope for structured restricted credentials. */
export async function readExactOrganizationPublicSystemSettingValueJson(
  db: DbPort,
  key: string,
  organizationId: string,
): Promise<unknown | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return null;
  const res = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT value_json
        FROM public.system_settings
        WHERE key = ${key}
          AND scope = 'admin'
          AND organization_id = ${normalizedOrganizationId}::uuid
        LIMIT 1`,
  );
  return res.rows[0]?.value_json ?? null;
}

/** Organization rows whose envelope contains the literal boolean/string true. */
export async function listExactOrganizationIdsWithTruePublicSystemSetting(
  db: DbPort,
  key: string,
): Promise<string[]> {
  const res = await runIntegratorSql<{ organization_id: string }>(
    db,
    sql`SELECT organization_id::text AS organization_id
        FROM public.system_settings
        WHERE key = ${key}
          AND scope = 'admin'
          AND organization_id IS NOT NULL
          AND lower(COALESCE(value_json ->> 'value', '')) IN ('true', '1')
        ORDER BY updated_at DESC, organization_id`,
  );
  return res.rows.map((row) => row.organization_id);
}
