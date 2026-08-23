import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import type { EffectiveOrgBranding } from '@/modules/org-branding/service';

export const RESOLVED_SURFACE_HEADER = 'x-bc-resolved-surface';

export type RequestSurface =
  | 'staff'
  | 'platform_admin'
  | 'patient_default'
  | 'patient_branded';

export type SurfaceAuthPolicy = 'staff' | 'platform_admin' | 'patient';

export type EffectivePatientBrand = EffectiveOrgBranding;

export type ResolvedSurface = Readonly<{
  surface: RequestSurface;
  publicOrigin: string;
  organizationId?: string;
  effectivePatientBrand?: EffectivePatientBrand;
  authPolicy: SurfaceAuthPolicy;
}>;

export type TenantSurfaceLookupResult =
  | Readonly<{
      status: 'active';
      organizationId: string;
      effectivePatientBrand: EffectivePatientBrand;
    }>
  | Readonly<{ status: 'unknown' | 'duplicate' | 'inactive' }>;

export type TenantSurfaceLookup = (normalizedHost: string) => Promise<TenantSurfaceLookupResult>;

export type RequestSurfaceResolver = (input: Readonly<{
  host: string | null;
  protocol: string;
  resolveTenantSurface: TenantSurfaceLookup;
}>) => Promise<ResolvedSurface | null>;

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
}) => {
  const requestOrigin = normalizeRequestOrigin(host, protocol);
  const platformOrigins = configuredPlatformOrigins();
  if (!requestOrigin || !platformOrigins) return null;

  const requestHost = requestOrigin.host.toLowerCase();
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
    return { surface: 'staff', publicOrigin, authPolicy: 'staff' };
  }
  if (requestHost === patientHost) {
    return { surface: 'patient_default', publicOrigin, authPolicy: 'patient' };
  }
  if (requestHost === adminHost) {
    return { surface: 'platform_admin', publicOrigin, authPolicy: 'platform_admin' };
  }

  // Persistence/domain seams store a hostname, never an HTTP authority with a development port.
  const tenant = await resolveTenantSurface(requestOrigin.hostname.toLowerCase());
  if (
    tenant.status !== 'active' ||
    !tenant.organizationId ||
    tenant.effectivePatientBrand.organizationId !== tenant.organizationId ||
    !tenant.effectivePatientBrand.core.isActive
  ) {
    return null;
  }

  return {
    surface: 'patient_branded',
    publicOrigin,
    organizationId: tenant.organizationId,
    effectivePatientBrand: tenant.effectivePatientBrand,
    authPolicy: 'patient',
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
    return resolved.effectivePatientBrand.effectiveDisplayName;
  }
  return PATIENT_DEFAULT_SURFACE.name;
}

function isRequestSurface(value: unknown): value is RequestSurface {
  return (
    value === 'staff' ||
    value === 'platform_admin' ||
    value === 'patient_default' ||
    value === 'patient_branded'
  );
}

function isAuthPolicy(value: unknown): value is SurfaceAuthPolicy {
  return value === 'staff' || value === 'platform_admin' || value === 'patient';
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
    if (
      !isRequestSurface(candidate.surface) ||
      !isAuthPolicy(candidate.authPolicy) ||
      typeof candidate.publicOrigin !== 'string' ||
      normalizedOrigin(candidate.publicOrigin)?.origin !== candidate.publicOrigin
    ) {
      return null;
    }
    if (candidate.surface === 'patient_branded') {
      if (
        typeof candidate.organizationId !== 'string' ||
        !candidate.effectivePatientBrand ||
        candidate.effectivePatientBrand.organizationId !== candidate.organizationId
      ) {
        return null;
      }
    } else if (candidate.organizationId || candidate.effectivePatientBrand) {
      return null;
    }
    return candidate as ResolvedSurface;
  } catch {
    return null;
  }
}

export function requireResolvedSurface(headers: Pick<Headers, 'get'>): ResolvedSurface {
  const resolved = readResolvedSurface(headers);
  if (!resolved) throw new Error('resolved_surface_header_missing_or_invalid');
  return resolved;
}
