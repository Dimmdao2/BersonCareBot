import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

/**
 * C3M-01 contract freeze — the closed workspace module registry
 * (`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.4). This list is closed by
 * product decision: nothing outside it is a workspace preference, and adding an entry requires an
 * owner-approved roadmap update, not a code-only change.
 */
export const WORKSPACE_MODULE_KEYS = [
  'medical_record',
  'encounters',
  'rehabilitation',
  'direct_chat',
  'program_comments',
  'program_media',
  'mailings',
  'analytics',
  'client_portal',
  'video_meetings',
] as const;

export type WorkspaceModuleKey = (typeof WORKSPACE_MODULE_KEYS)[number];

function isWorkspaceModuleKey(value: string): value is WorkspaceModuleKey {
  return (WORKSPACE_MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Direct-dependency registry frozen by C3M-01 (§C3M.4): each entry lists the modules that must
 * themselves be effective for this module to be effective. `rehabilitation` is the parent of
 * `program_comments`, which is in turn the parent of `program_media`; `direct_chat`,
 * `program_comments` and `program_media` additionally require an available client cabinet
 * (`client_portal`). Turning a parent OFF makes its descendants effective-OFF without touching
 * their own stored preference — see `resolveWorkspaceModuleEffective`.
 */
export const WORKSPACE_MODULE_DEPENDENCIES: Readonly<
  Record<WorkspaceModuleKey, readonly WorkspaceModuleKey[]>
> = {
  medical_record: [],
  encounters: [],
  rehabilitation: [],
  direct_chat: ['client_portal'],
  program_comments: ['rehabilitation', 'client_portal'],
  program_media: ['program_comments'],
  mailings: [],
  analytics: [],
  client_portal: [],
  video_meetings: [],
};

export const DOCTOR_WORKSPACE_COMPOSITION_KEY = 'doctor_workspace_composition' as const;
export const DOCTOR_WORKSPACE_COMPOSITION_VERSION = 1 as const;

export const DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY = 'doctor_workspace_client_defaults' as const;
export const DOCTOR_WORKSPACE_CLIENT_DEFAULTS_VERSION = 1 as const;
export const WORKSPACE_CLIENT_CHANNEL_KEYS = [
  'direct_chat',
  'program_comments',
  'program_media',
] as const;
export const WORKSPACE_CLIENT_DEFAULT_MODES = ['off', 'all', 'on_support'] as const;

export type WorkspaceClientChannelKey = (typeof WORKSPACE_CLIENT_CHANNEL_KEYS)[number];
export type WorkspaceClientDefaultMode = (typeof WORKSPACE_CLIENT_DEFAULT_MODES)[number];

export type DoctorWorkspaceClientDefaults = Readonly<{
  version: typeof DOCTOR_WORKSPACE_CLIENT_DEFAULTS_VERSION;
  channelDefaults: Readonly<Record<WorkspaceClientChannelKey, WorkspaceClientDefaultMode>>;
  patientSymptomTrackingDefault: WorkspaceClientDefaultMode;
}>;

export type DoctorWorkspaceComposition = Readonly<{
  version: typeof DOCTOR_WORKSPACE_COMPOSITION_VERSION;
  modules: Readonly<Record<WorkspaceModuleKey, boolean>>;
}>;

/** Compatibility default (C3M-03): absence of a stored preference hides nothing. */
export function defaultDoctorWorkspaceComposition(): DoctorWorkspaceComposition {
  return {
    version: DOCTOR_WORKSPACE_COMPOSITION_VERSION,
    modules: Object.fromEntries(WORKSPACE_MODULE_KEYS.map((key) => [key, true])) as Record<
      WorkspaceModuleKey,
      boolean
    >,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWorkspaceClientDefaultMode(value: unknown): value is WorkspaceClientDefaultMode {
  return (
    typeof value === 'string' &&
    (WORKSPACE_CLIENT_DEFAULT_MODES as readonly string[]).includes(value)
  );
}

/** C3M-04 compatibility projection when the structured row has not been stored yet. */
export function defaultDoctorWorkspaceClientDefaults(
  input: {
    legacyCommentsWithoutSupportEnabled?: boolean;
    legacyMediaWithoutSupportEnabled?: boolean;
  } = {},
): DoctorWorkspaceClientDefaults {
  return {
    version: DOCTOR_WORKSPACE_CLIENT_DEFAULTS_VERSION,
    channelDefaults: {
      direct_chat: 'all',
      program_comments: input.legacyCommentsWithoutSupportEnabled === true ? 'all' : 'on_support',
      program_media: input.legacyMediaWithoutSupportEnabled === true ? 'all' : 'on_support',
    },
    patientSymptomTrackingDefault: 'all',
  };
}

/** Strict validator used by both the settings UI read and the canonical write boundary. */
export function normalizeDoctorWorkspaceClientDefaults(
  value: unknown,
): DoctorWorkspaceClientDefaults | null {
  if (!isRecord(value)) return null;
  if (value.version !== DOCTOR_WORKSPACE_CLIENT_DEFAULTS_VERSION) return null;
  if (!isRecord(value.channelDefaults)) return null;
  const channelKeys = Object.keys(value.channelDefaults);
  if (
    channelKeys.length !== WORKSPACE_CLIENT_CHANNEL_KEYS.length ||
    channelKeys.some((key) => !(WORKSPACE_CLIENT_CHANNEL_KEYS as readonly string[]).includes(key))
  ) {
    return null;
  }
  const channelDefaults = {} as Record<WorkspaceClientChannelKey, WorkspaceClientDefaultMode>;
  for (const key of WORKSPACE_CLIENT_CHANNEL_KEYS) {
    const mode = value.channelDefaults[key];
    if (!isWorkspaceClientDefaultMode(mode)) return null;
    channelDefaults[key] = mode;
  }
  if (!isWorkspaceClientDefaultMode(value.patientSymptomTrackingDefault)) return null;
  return {
    version: DOCTOR_WORKSPACE_CLIENT_DEFAULTS_VERSION,
    channelDefaults,
    patientSymptomTrackingDefault: value.patientSymptomTrackingDefault,
  };
}

export function parseDoctorWorkspaceClientDefaults(
  valueJson: unknown,
  legacy: {
    legacyCommentsWithoutSupportEnabled?: boolean;
    legacyMediaWithoutSupportEnabled?: boolean;
  } = {},
): DoctorWorkspaceClientDefaults {
  if (!isRecord(valueJson) || !('value' in valueJson)) {
    return defaultDoctorWorkspaceClientDefaults(legacy);
  }
  const parsed = normalizeDoctorWorkspaceClientDefaults(valueJson.value);
  if (parsed === null)
    throw new RuntimeSettingUnavailableError(DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY);
  return parsed;
}

/**
 * Structural validator for a *persisted* (non-absent) value. Returns `null` when the envelope's
 * `version`/`modules` shape cannot be trusted — an unknown module key or a non-boolean flag
 * invalidates the whole value, the same fail-closed-on-corruption rule
 * `platform_integration_availability` already uses for its envelope. A module key that the shape is
 * otherwise valid but simply does not mention keeps compat visibility (`true`), so a future addition
 * to `WORKSPACE_MODULE_KEYS` does not retroactively invalidate every already-stored row.
 */
export function normalizeDoctorWorkspaceComposition(
  value: unknown,
): DoctorWorkspaceComposition | null {
  if (!isRecord(value)) return null;
  if (value.version !== DOCTOR_WORKSPACE_COMPOSITION_VERSION) return null;
  if (!isRecord(value.modules)) return null;
  const modules = {} as Record<WorkspaceModuleKey, boolean>;
  for (const [key, flag] of Object.entries(value.modules)) {
    if (!isWorkspaceModuleKey(key)) return null;
    if (typeof flag !== 'boolean') return null;
    modules[key] = flag;
  }
  for (const key of WORKSPACE_MODULE_KEYS) {
    if (!(key in modules)) modules[key] = true;
  }
  return { version: DOCTOR_WORKSPACE_COMPOSITION_VERSION, modules };
}

/**
 * A missing row is compatibility mode (C3M-03, owner requirement): every already-available module
 * stays visible, no backfill needed. A present-but-malformed row is a different case and must not
 * default open — it throws, exactly like every other structured setting in this module
 * (`doctorTodayPreferences.ts`, `platformIntegrationAvailability.ts`). Callers must fail closed on
 * that error rather than substitute a default, or a corrupted write would silently widen what the
 * specialist sees.
 */
export function parseDoctorWorkspaceComposition(valueJson: unknown): DoctorWorkspaceComposition {
  if (!isRecord(valueJson) || !('value' in valueJson)) {
    return defaultDoctorWorkspaceComposition();
  }
  const parsed = normalizeDoctorWorkspaceComposition(valueJson.value);
  if (parsed === null) throw new RuntimeSettingUnavailableError(DOCTOR_WORKSPACE_COMPOSITION_KEY);
  return parsed;
}

/**
 * Existing availability for each module, already computed by whatever surface calls the resolver
 * below (tariff entitlement, cabinet access, actor capability such as `clinical.workspace`, …) —
 * this module never computes availability itself. Fold every upstream gate into this map before
 * calling `resolveWorkspaceModuleEffective`; its only job is intersecting it with the stored
 * preference, once.
 */
export type WorkspaceModuleAvailability = Readonly<Record<WorkspaceModuleKey, boolean>>;
export type WorkspaceModuleEffective = Readonly<Record<WorkspaceModuleKey, boolean>>;

/**
 * The one effective resolver (C3M-03, §C3M.3 canonical formula `effective = availability &&
 * workspaceEnabled`): combines existing availability and stored workspace preference exactly once
 * per module, then honors the frozen dependency graph above so a disabled/unavailable parent makes
 * its descendants effective-OFF too. Never broadens `availability` — a module can only move from
 * available to hidden here, never the reverse. Shell/route consumers project this map instead of
 * re-deriving the formula per surface.
 */
export function resolveWorkspaceModuleEffective(
  composition: DoctorWorkspaceComposition,
  availability: WorkspaceModuleAvailability,
): WorkspaceModuleEffective {
  const effective = {} as Record<WorkspaceModuleKey, boolean>;
  function resolve(key: WorkspaceModuleKey): boolean {
    if (key in effective) return effective[key];
    const selfOn = availability[key] === true && composition.modules[key] === true;
    const parentsOn = WORKSPACE_MODULE_DEPENDENCIES[key].every((parent) => resolve(parent));
    const value = selfOn && parentsOn;
    effective[key] = value;
    return value;
  }
  for (const key of WORKSPACE_MODULE_KEYS) resolve(key);
  return effective;
}
