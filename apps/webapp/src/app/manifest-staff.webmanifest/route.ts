import { buildStaffPwaManifest } from '@/shared/lib/pwa/staffPwaManifest';
import { canSurfaceEnterRoute } from '@/config/surfaceRoutes';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

export async function GET() {
  const resolved = await getResolvedSurface();
  if (!canSurfaceEnterRoute(resolved.surface, '/manifest-staff.webmanifest')) {
    return new Response(null, { status: 404 });
  }
  return Response.json(buildStaffPwaManifest(resolved), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
