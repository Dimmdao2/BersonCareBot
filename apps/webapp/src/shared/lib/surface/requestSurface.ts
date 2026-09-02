import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  DEFAULT_PATIENT_ACCENT_TOKEN,
  type AnonymousPatientBrand,
} from '@/modules/org-branding/service';
import { validateOrganizationSlugCandidate } from '@/modules/clinic-directory/organizationSlug';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  SURFACE_AUTH_METHODS,
  type SurfaceAuthMethod,
  type SurfaceAuthPolicy,
  type SurfaceAuthPolicyConfig,
  type SurfaceAuthPolicyName,
} from '@/shared/lib/surface/surfaceAuthPolicy';

export {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  SURFACE_AUTH_METHODS,
  type SurfaceAuthMethod,
  type SurfaceAuthPolicy,
  type SurfaceAuthPolicyConfig,
  type SurfaceAuthPolicyName,
} from '@/shared/lib/surface/surfaceAuthPolicy';

export const RESOLVED_SURFACE_HEADER = 'x-bc-resolved-surface';

export type RequestSurface = 'staff' | 'platform_admin' | 'patient_default' | 'patient_branded';

export type EffectivePatientBrand = AnonymousPatientBrand;

/**
 * Public identity of the clinic's OWN Telegram/MAX bot on a branded patient surface.
 *
 * `ready` — the clinic declared its bot, the live channel probe confirmed it and the public
 * handle is present, so its deep links must use that bot.
 * `declared_invalid` — the clinic declared its own bot, but its exact identity is not usable
 * (probe never passed, handle missing/garbled). Owner 20.08: a declared clinic bot is the clinic's
 * channel, so this NEVER falls back to the platform bot silently — the request refuses instead.
 * Absent key — the clinic has no bot of its own on that platform: common Therapysto applies.
 */
export type ClinicMessengerBotSurface =
  | Readonly<{ status: 'ready'; publicId: string }>
  | Readonly<{ status: 'declared_invalid' }>;

export type ClinicMessengerBots = Readonly<{
  telegram?: ClinicMessengerBotSurface;
  max?: ClinicMessengerBotSurface;
}>;

export type ResolvedSurface = Readonly<{
  surface: RequestSurface;
  publicOrigin: string;
  organizationId?: string;
  clinicSlug?: string;
  /** One org setting decides whether its branded root opens the common patient entry immediately. */
  skipPublicCardAtRoot?: boolean;
  effectivePatientBrand?: EffectivePatientBrand;
  /** Branded surface only: the clinic's own bot identity per platform (see the type doc). */
  clinicMessengerBots?: ClinicMessengerBots;
  authPolicy: SurfaceAuthPolicy;
}>;

export type TenantSurfaceLookupResult =
  | Readonly<{
      status: 'active';
      organizationId: string;
      clinicSlug: string;
      /** Derived from `clinic_root_skip_public_card`; absence stays on the public-card default. */
      skipPublicCardAtRoot?: boolean;
      /** Trusted organization provenance of the projected brand before its id is stripped. */
      effectivePatientBrandOrganizationId: string;
      effectivePatientBrand: EffectivePatientBrand;
      /**
       * Public half of the clinic's per-org bot configuration. The lookup seam owns the read
       * (it is the only anonymous-request place with an organization-scoped DB principal); this
       * resolver only sanitizes and forwards it.
       */
      clinicMessengerBots?: ClinicMessengerBots;
    }>
  | Readonly<{ status: 'unknown' | 'duplicate' | 'inactive' }>;

export type TenantSurfaceLookup = (normalizedHost: string) => Promise<TenantSurfaceLookupResult>;

export type RequestSurfaceResolver = (
  input: Readonly<{
    host: string | null;
    protocol: string;
    resolveTenantSurface: TenantSurfaceLookup;
    authPolicyConfig?: SurfaceAuthPolicyConfig;
  }>,
) => Promise<ResolvedSurface | null>;

const SURFACE_AUTH_METHOD_SET = new Set<SurfaceAuthMethod>(SURFACE_AUTH_METHODS);

function sanitizeSurfaceAuthPolicy(value: unknown): SurfaceAuthPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SurfaceAuthPolicy>;
  if (!Array.isArray(candidate.availableMethods) || !Array.isArray(candidate.enabledMethods)) {
    return null;
  }
  const availableMethods = candidate.availableMethods.filter(
    (method): method is SurfaceAuthMethod =>
      typeof method === 'string' && SURFACE_AUTH_METHOD_SET.has(method as SurfaceAuthMethod),
  );
  const enabledMethods = candidate.enabledMethods.filter(
    (method): method is SurfaceAuthMethod =>
      typeof method === 'string' && SURFACE_AUTH_METHOD_SET.has(method as SurfaceAuthMethod),
  );
  if (
    availableMethods.length !== candidate.availableMethods.length ||
    enabledMethods.length !== candidate.enabledMethods.length ||
    new Set(availableMethods).size !== availableMethods.length ||
    new Set(enabledMethods).size !== enabledMethods.length ||
    enabledMethods.some((method) => !availableMethods.includes(method))
  ) {
    return null;
  }
  return { availableMethods, enabledMethods };
}

function policyFor(
  name: SurfaceAuthPolicyName,
  config: SurfaceAuthPolicyConfig,
): SurfaceAuthPolicy | null {
  return sanitizeSurfaceAuthPolicy(config[name]);
}

function normalizedOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function configuredPlatformOrigins(): Readonly<{
  staff: URL;
  patient: URL;
}> | null {
  const staff = normalizedOrigin(STAFF_SURFACE.origin);
  const patient = normalizedOrigin(PATIENT_DEFAULT_SURFACE.origin);
  return staff && patient ? { staff, patient } : null;
}

/** Route audiences are enforceable only when Host can distinguish staff from patient requests. */
export function arePlatformSurfaceHostsDistinct(): boolean {
  const origins = configuredPlatformOrigins();
  return Boolean(
    origins && origins.staff.host.toLowerCase() !== origins.patient.host.toLowerCase(),
  );
}

function normalizeRequestOrigin(host: string | null, protocol: string): URL | null {
  const normalizedProtocol = protocol.replace(/:$/, '').toLowerCase();
  if (!host || (normalizedProtocol !== 'http' && normalizedProtocol !== 'https')) return null;
  if (host.includes(',') || /[\s/@\\]/.test(host)) return null;
  return normalizedOrigin(`${normalizedProtocol}://${host.trim().toLowerCase()}`);
}

function platformAdminHost(staffOrigin: URL): string {
  return `admin.${staffOrigin.hostname}${staffOrigin.port ? `:${staffOrigin.port}` : ''}`;
}

function requestPlatformHost(requestOrigin: URL, staffOrigin: URL): string {
  const requestHostname = requestOrigin.hostname.toLowerCase();
  const staffHostname = staffOrigin.hostname.toLowerCase();
  const isLoopbackStaffHost = staffHostname === '127.0.0.1' || staffHostname === 'localhost';

  // SSH local forwarding changes only the TCP destination. A browser opened at
  // http://127.0.0.1:15200 still sends Host: 127.0.0.1:15200 to the DEV process listening on
  // 127.0.0.1:5200. Treat a different port on the same configured loopback hostname as that same
  // DEV staff surface; non-loopback deploy hosts remain exact, fail-closed matches.
  if (
    requestOrigin.protocol === 'http:' &&
    isLoopbackStaffHost &&
    requestHostname === staffHostname
  ) {
    return staffOrigin.host.toLowerCase();
  }

  return requestOrigin.host.toLowerCase();
}

/** Strip every management/internal field before a brand can enter the request header. */
/** Same safe public-handle alphabet Telegram usernames and MAX nicknames share. */
const CLINIC_BOT_PUBLIC_ID_RE = /^[A-Za-z0-9_]{3,64}$/;

/**
 * Fails CLOSED per platform: anything present but unrecognized becomes `declared_invalid`, never
 * silently disappears into the platform-bot default. Only an absent key means «no own bot».
 */
function sanitizeClinicMessengerBots(value: unknown): ClinicMessengerBots | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return { telegram: { status: 'declared_invalid' }, max: { status: 'declared_invalid' } };
  const record = value as Record<string, unknown>;
  const entry = (raw: unknown): ClinicMessengerBotSurface | undefined => {
    if (raw === undefined) return undefined;
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const candidate = raw as Record<string, unknown>;
      const publicId = typeof candidate.publicId === 'string' ? candidate.publicId.trim() : '';
      if (candidate.status === 'ready' && CLINIC_BOT_PUBLIC_ID_RE.test(publicId)) {
        return { status: 'ready', publicId };
      }
    }
    return { status: 'declared_invalid' };
  };
  const telegram = entry(record.telegram);
  const max = entry(record.max);
  if (!telegram && !max) return undefined;
  return { ...(telegram ? { telegram } : {}), ...(max ? { max } : {}) };
}

function sanitizeEffectivePatientBrand(value: unknown): EffectivePatientBrand | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<EffectivePatientBrand>;
  const effectiveDisplayName = candidate.effectiveDisplayName?.trim();
  const patientAppName = candidate.patientAppName?.trim();
  const accentToken = candidate.accentToken?.trim().toLowerCase();
  if (
    !effectiveDisplayName ||
    !patientAppName ||
    !accentToken ||
    !/^#[0-9a-f]{6}$/.test(accentToken)
  ) {
    return null;
  }
  const logoUrl = candidate.logoUrl;
  if (
    logoUrl !== undefined &&
    !/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      logoUrl,
    )
  ) {
    return null;
  }
  return {
    effectiveDisplayName,
    patientAppName,
    accentToken,
    ...(logoUrl ? { logoUrl } : {}),
  };
}

/**
 * The single Host -> surface resolver (TPB-16).
 *
 * It owns normalization and the complete result. Tenant lookup stays behind the injected B1/B4
 * seam: this module never reads the database, a slug or system_settings itself. `null` is a hard
 * not-found decision; callers must never replace it with a platform/default surface.
 */
export const resolveRequestSurface: RequestSurfaceResolver = async ({
  host,
  protocol,
  resolveTenantSurface,
  authPolicyConfig = DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
}) => {
  const requestOrigin = normalizeRequestOrigin(host, protocol);
  const platformOrigins = configuredPlatformOrigins();
  if (!requestOrigin || !platformOrigins) return null;

  const requestHost = requestPlatformHost(requestOrigin, platformOrigins.staff);
  const staffHost = platformOrigins.staff.host.toLowerCase();
  const patientHost = platformOrigins.patient.host.toLowerCase();
  const adminHost = platformAdminHost(platformOrigins.staff).toLowerCase();
  const matchingPlatformSurfaces = [staffHost, patientHost, adminHost].filter(
    (candidate) => candidate === requestHost,
  );

  const isSharedStaffAndPatientHost =
    staffHost === patientHost && requestHost === staffHost && requestHost !== adminHost;
  // The deliberate transitional single-Host deployment keeps staff identity while the route gate
  // is disabled. Every other duplicated platform Host remains ambiguous and fails closed.
  if (matchingPlatformSurfaces.length > 1 && !isSharedStaffAndPatientHost) return null;

  const publicOrigin = requestOrigin.origin;
  if (requestHost === staffHost) {
    const authPolicy = policyFor('staff', authPolicyConfig);
    return authPolicy ? { surface: 'staff', publicOrigin, authPolicy } : null;
  }
  if (requestHost === patientHost) {
    const authPolicy = policyFor('patient', authPolicyConfig);
    return authPolicy ? { surface: 'patient_default', publicOrigin, authPolicy } : null;
  }
  if (requestHost === adminHost) {
    const authPolicy = policyFor('platform_admin', authPolicyConfig);
    return authPolicy ? { surface: 'platform_admin', publicOrigin, authPolicy } : null;
  }

  // Persistence/domain seams store a hostname, never an HTTP authority with a development port.
  const tenant = await resolveTenantSurface(requestOrigin.hostname.toLowerCase());
  if (
    tenant.status !== 'active' ||
    !tenant.organizationId ||
    tenant.effectivePatientBrandOrganizationId !== tenant.organizationId
  ) {
    return null;
  }
  const effectivePatientBrand = sanitizeEffectivePatientBrand(tenant.effectivePatientBrand);
  const clinicSlug = validateOrganizationSlugCandidate(tenant.clinicSlug);
  const authPolicy = policyFor('patient', authPolicyConfig);
  if (
    !effectivePatientBrand ||
    !clinicSlug.ok ||
    tenant.clinicSlug !== clinicSlug.slug ||
    !authPolicy
  ) {
    return null;
  }

  const clinicMessengerBots = sanitizeClinicMessengerBots(tenant.clinicMessengerBots);
  return {
    surface: 'patient_branded',
    publicOrigin,
    organizationId: tenant.organizationId,
    clinicSlug: clinicSlug.slug,
    skipPublicCardAtRoot: tenant.skipPublicCardAtRoot === true,
    effectivePatientBrand,
    ...(clinicMessengerBots ? { clinicMessengerBots } : {}),
    authPolicy,
  };
};

/** Pure presentation projection of the already-resolved request value; never reads Host or state. */
export function surfaceDisplayName(resolved: ResolvedSurface): string {
  if (resolved.surface === 'staff' || resolved.surface === 'platform_admin') {
    return STAFF_SURFACE.name;
  }
  if (resolved.surface === 'patient_branded') {
    if (!resolved.effectivePatientBrand) {
      throw new Error('branded_surface_requires_effective_patient_brand');
    }
    return resolved.effectivePatientBrand.patientAppName;
  }
  return PATIENT_DEFAULT_SURFACE.name;
}

/** One patient accent selected by the already-resolved Host; every other surface keeps default. */
export function surfaceAccentToken(resolved: ResolvedSurface): string {
  return resolved.surface === 'patient_branded' && resolved.effectivePatientBrand
    ? resolved.effectivePatientBrand.accentToken
    : DEFAULT_PATIENT_ACCENT_TOKEN;
}

function isRequestSurface(value: unknown): value is RequestSurface {
  return (
    value === 'staff' ||
    value === 'platform_admin' ||
    value === 'patient_default' ||
    value === 'patient_branded'
  );
}

export function serializeResolvedSurface(surface: ResolvedSurface): string {
  return encodeURIComponent(JSON.stringify(surface));
}

/** Parse the proxy-produced value. This reads a result; it never resolves Host again. */
export function readResolvedSurface(headers: Pick<Headers, 'get'>): ResolvedSurface | null {
  const encoded = headers.get(RESOLVED_SURFACE_HEADER);
  if (!encoded) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<ResolvedSurface>;
    const authPolicy = sanitizeSurfaceAuthPolicy(candidate.authPolicy);
    if (
      !isRequestSurface(candidate.surface) ||
      !authPolicy ||
      typeof candidate.publicOrigin !== 'string' ||
      normalizedOrigin(candidate.publicOrigin)?.origin !== candidate.publicOrigin
    ) {
      return null;
    }
    if (candidate.surface === 'patient_branded') {
      const effectivePatientBrand = sanitizeEffectivePatientBrand(candidate.effectivePatientBrand);
      const clinicSlug =
        typeof candidate.clinicSlug === 'string'
          ? validateOrganizationSlugCandidate(candidate.clinicSlug)
          : null;
      if (
        typeof candidate.organizationId !== 'string' ||
        !clinicSlug?.ok ||
        candidate.clinicSlug !== clinicSlug.slug ||
        !effectivePatientBrand
      ) {
        return null;
      }
      const { clinicMessengerBots: rawClinicMessengerBots, ...withoutBots } = candidate;
      const clinicMessengerBots = sanitizeClinicMessengerBots(rawClinicMessengerBots);
      return {
        ...withoutBots,
        authPolicy,
        clinicSlug: clinicSlug.slug,
        skipPublicCardAtRoot: candidate.skipPublicCardAtRoot === true,
        effectivePatientBrand,
        ...(clinicMessengerBots ? { clinicMessengerBots } : {}),
      } as ResolvedSurface;
    } else if (
      candidate.organizationId ||
      candidate.clinicSlug ||
      candidate.skipPublicCardAtRoot !== undefined ||
      candidate.effectivePatientBrand ||
      candidate.clinicMessengerBots
    ) {
      return null;
    }
    return { ...candidate, authPolicy } as ResolvedSurface;
  } catch {
    return null;
  }
}

export function requireResolvedSurface(headers: Pick<Headers, 'get'>): ResolvedSurface {
  const resolved = readResolvedSurface(headers);
  if (!resolved) throw new Error('resolved_surface_header_missing_or_invalid');
  return resolved;
}
