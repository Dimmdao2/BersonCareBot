import { buildPatientPwaManifest } from '@/shared/lib/pwa/patientPwaManifest';
import {
  arePlatformSurfaceHostsDistinct,
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

/**
 * Тот же URL и то же тело, что отдавал file-based `app/manifest.ts`. Route handler нужен, чтобы
 * ссылку на манифест ставил единственный резолвер поверхности, а не Next автоматически —
 * см. `shared/lib/pwa/patientPwaManifest.ts`.
 */
export async function GET() {
  const resolved = await getResolvedSurface();
  // On the transitional single Host the resolver deliberately keeps staff identity, but this
  // legacy URL still belongs to already-installed patient PWAs. Preserve that contract without
  // teaching the Host resolver about pathname.
  if (resolved.surface === 'platform_admin') {
    return new Response(null, { status: 404 });
  }
  const manifestSurface: ResolvedSurface =
    resolved.surface === 'staff' && !arePlatformSurfaceHostsDistinct()
      ? {
          surface: 'patient_default',
          publicOrigin: resolved.publicOrigin,
          authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
        }
      : resolved;
  return Response.json(buildPatientPwaManifest(manifestSurface), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
