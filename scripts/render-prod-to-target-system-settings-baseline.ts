#!/usr/bin/env tsx

import {
  SYSTEM_SETTING_REGISTRY,
  type SystemSettingDefinition,
} from '../apps/webapp/src/modules/system-settings/registry';

const EXPLICIT_INITIAL_VALUES: Readonly<Record<string, unknown>> = {
  important_fallback_delay_minutes: 60,
  operator_alert_fallback_email: '',
};

const REQUIRED_NON_GLOBAL_FALLBACKS = Object.freeze([
  {
    key: 'doctor_today_preferences',
    scope: 'doctor',
    value: { peopleListMode: 'on_support' },
  },
] as const);

function fail(message: string): never {
  throw new Error(`prod-to-target system-settings baseline: ${message}`);
}

function parseDefaultValue(key: string, definition: SystemSettingDefinition): unknown {
  if (Object.hasOwn(EXPLICIT_INITIAL_VALUES, key)) return EXPLICIT_INITIAL_VALUES[key];
  const raw = definition.defaultValue;
  if (raw === 'absent') {
    if (definition.valueContract === 'string_list') return [];
    if (definition.valueContract === 'string' || definition.valueContract === 'url') return '';
    return null;
  }
  if (definition.valueContract === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    fail(`${key} has invalid boolean default`);
  }
  if (definition.valueContract === 'integer') {
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) fail(`${key} has invalid integer default`);
    return parsed;
  }
  if (definition.valueContract === 'structured' || definition.valueContract === 'string_list') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      fail(`${key} has invalid JSON default`);
    }
  }
  return raw;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const entries = Object.entries(SYSTEM_SETTING_REGISTRY)
  .filter(([, definition]) => definition.ownership === 'global')
  .sort(([left], [right]) => left.localeCompare(right, 'en'));

const rows = entries.map(([key, definition]) => {
  const valueJson = JSON.stringify({ value: parseDefaultValue(key, definition) });
  return `  (${sqlText(key)}, 'admin', NULL, ${sqlText(valueJson)}::jsonb, statement_timestamp(), NULL)`;
});
for (const fallback of REQUIRED_NON_GLOBAL_FALLBACKS) {
  const definition = SYSTEM_SETTING_REGISTRY[fallback.key];
  if (!definition || definition.scope !== 'doctor' || definition.ownership !== 'per_org') {
    fail(`${fallback.key} is not a registered per-organization doctor setting`);
  }
  const valueJson = JSON.stringify({ value: fallback.value });
  rows.push(
    `  (${sqlText(fallback.key)}, ${sqlText(fallback.scope)}, NULL, ${sqlText(valueJson)}::jsonb, statement_timestamp(), NULL)`,
  );
}
const expectedRows = [
  ...entries.map(([key]) => `    (${sqlText(key)}, 'admin')`),
  ...REQUIRED_NON_GLOBAL_FALLBACKS.map(
    (fallback) => `    (${sqlText(fallback.key)}, ${sqlText(fallback.scope)})`,
  ),
];

if (rows.length === 0) fail('registry produced no global rows');

process.stdout.write(
  [
    '',
    '-- Generated from SYSTEM_SETTING_REGISTRY. Existing source values always win.',
    'INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)',
    'SELECT seed.key, seed.scope, seed.organization_id::uuid, seed.value_json, seed.updated_at, seed.updated_by::uuid',
    'FROM (VALUES',
    rows.join(',\n'),
    ') AS seed(key, scope, organization_id, value_json, updated_at, updated_by)',
    'WHERE NOT EXISTS (',
    '  SELECT 1 FROM public.system_settings existing',
    '  WHERE existing.key = seed.key',
    '    AND existing.scope = seed.scope',
    '    AND existing.organization_id IS NOT DISTINCT FROM seed.organization_id::uuid',
    ');',
    '',
    'DO $target_system_settings_gate$',
    'DECLARE missing_keys text;',
    'BEGIN',
    '  SELECT string_agg(expected.key, comma.value ORDER BY expected.key) INTO missing_keys',
    '  FROM (VALUES',
    expectedRows.join(',\n'),
    '  ) AS expected(key, scope)',
    "  CROSS JOIN (VALUES (', '::text)) AS comma(value)",
    '  WHERE NOT EXISTS (',
    '    SELECT 1 FROM public.system_settings setting',
    '    WHERE setting.key = expected.key AND setting.scope = expected.scope',
    '      AND setting.organization_id IS NULL',
    '  );',
    "  IF missing_keys IS NOT NULL THEN RAISE EXCEPTION 'missing target global system settings: %', missing_keys; END IF;",
    'END',
    '$target_system_settings_gate$;',
    '',
  ].join('\n'),
);
