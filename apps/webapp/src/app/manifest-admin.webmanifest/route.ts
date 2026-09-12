import { buildAdminPwaManifest } from '@/shared/lib/pwa/adminPwaManifest';
import { canSurfaceEnterRoute } from '@/config/surfaceRoutes';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

export async function GET() {
  const resolved = await getResolvedSurface();
  if (!canSurfaceEnterRoute(resolved.surface, '/manifest-admin.webmanifest')) {
    return new Response(null, { status: 404 });
  }
  return Response.json(buildAdminPwaManifest(resolved), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
