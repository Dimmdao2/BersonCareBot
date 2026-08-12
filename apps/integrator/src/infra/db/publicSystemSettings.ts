/**
 * Runtime reads of canonical `public.system_settings` (unified DB) for the integrator.
 *
 * All of them go through DB-owned SECURITY DEFINER capabilities with fixed key allow-lists. There
 * is deliberately no direct-table reader here. The base login is REVOKEd from that table outright
 * (deploy/postgres/integrator-server-runtime-config.sql), and while it can `SET ROLE app_staff` --
 * which does hold SELECT and `app.current_org_id()` -- none of this app's background contours run
 * under a staff principal. Bootstrap, infra and the operational capability roles hold neither, so
 * a direct read from any of them is a hard `42501`.
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { runIntegratorNamedRoot, runIntegratorSql } from './runIntegratorSql.js';

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

/**
 * Global provider configuration through the DB-owned fixed allowlist capability.
 * The integrator runtime login receives EXECUTE on the function, never table SELECT.
 */
export async function fetchIntegratorProviderRuntimeSettingValueJson(
  db: DbPort,
  key: IntegratorProviderRuntimeSettingKey,
): Promise<unknown | null> {
  const result = await runWithDbInfraPrincipal({ source: 'integrator-server-runtime-config' }, () =>
    runIntegratorNamedRoot<{ value_json: unknown }>(
      db,
      'app.read_integrator_provider_runtime_setting(text)',
      [key],
      sql`SELECT app.read_integrator_provider_runtime_setting(${key}) AS value_json`,
    ),
  );
  const row = result.rows[0];
  return row?.value_json ?? null;
}

export type IntegratorRuntimeSettingKey =
  | 'integrator_linked_phone_source'
  | 'admin_telegram_ids'
  | 'admin_max_ids'
  | 'doctor_telegram_ids'
  | 'doctor_max_ids'
  | 'operator_health_alert_config'
  | 'admin_incident_alert_config'
  | 'app_display_timezone'
  | `notif_template:${'created' | 'cancelled' | 'rescheduled'}:${'patient' | 'doctor'}`;

export type IntegratorGoogleCalendarGlobalSettingKey =
  'google_client_id' | 'google_client_secret' | 'google_redirect_uri';

export type IntegratorGoogleCalendarOrganizationSettingKey =
  'google_calendar_enabled' | 'google_calendar_id' | 'google_refresh_token';

export type IntegratorClinicDeliveryCredentialKey =
  | 'clinic_smtp_outbound'
  | 'clinic_smsc_api_key'
  | 'clinic_telegram_bot_token'
  | 'clinic_max_bot_api_key';

/**
 * Clinic-owned delivery credential (tariff branding) for the EXACT current organization.
 * The tariff-mechanic gate runs in the caller, before this read.
 */
export async function fetchIntegratorClinicDeliveryCredentialValueJson(
  db: DbPort,
  key: IntegratorClinicDeliveryCredentialKey,
  organizationId: string,
): Promise<unknown | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return null;
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_clinic_delivery_credential(
      ${key}, ${normalizedOrganizationId}::uuid
    ) AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/**
 * Non-secret integrator runtime settings through the DB-owned fixed allow-list capability.
 *
 * Each caller had its own fail-safe, which is why the pre-capability 42501 stayed invisible in
 * the journal until the handlers were actually exercised (found 2026-08-07).
 */
export async function fetchIntegratorRuntimeSettingValueJson(
  db: DbPort,
  key: IntegratorRuntimeSettingKey,
): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_runtime_setting(${key}) AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/** Platform-wide Google OAuth identity (credentials); global rows only. */
export async function fetchIntegratorGoogleCalendarGlobalSettingString(
  db: DbPort,
  key: IntegratorGoogleCalendarGlobalSettingKey,
): Promise<string | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_google_calendar_setting(${key}, NULL) AS value_json`,
  );
  const row = result.rows[0];
  return row ? parseSystemSettingStringValue(row.value_json) : null;
}

/**
 * Per-clinic calendar connection; EXACT organization row only, never a global fallback — a clinic
 * connection must not inherit another clinic's calendar or refresh token.
 */
export async function fetchIntegratorGoogleCalendarOrganizationSettingString(
  db: DbPort,
  key: IntegratorGoogleCalendarOrganizationSettingKey,
  organizationId: string,
): Promise<string | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return null;
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_google_calendar_setting(
      ${key}, ${normalizedOrganizationId}::uuid
    ) AS value_json`,
  );
  const row = result.rows[0];
  return row ? parseSystemSettingStringValue(row.value_json) : null;
}

/** Operator probe cadence; read by the scheduler tick and by the operator-health route alike. */
export async function fetchOperatorHealthProbeConfigValueJson(db: DbPort): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_operator_health_probe_config() AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/** Verbose operational logging flag through its capability; boolean-only, fail-safe false. */
export async function fetchOperationalVerboseLogFlag(db: DbPort): Promise<boolean> {
  const result = await runIntegratorSql<{ enabled: boolean | null }>(
    db,
    sql`SELECT app.read_operational_verbose_log_flag() AS enabled`,
  );
  return result.rows[0]?.enabled === true;
}

/** Organizations with the clinic Google Calendar switch on, for the outbound probe only. */
export async function listGoogleCalendarProbeOrganizationIdsViaCapability(
  db: DbPort,
): Promise<string[]> {
  const result = await runIntegratorSql<{ organization_id: string }>(
    db,
    sql`SELECT app.list_google_calendar_probe_organization_ids()::text AS organization_id`,
  );
  return result.rows.map((row) => row.organization_id);
}
