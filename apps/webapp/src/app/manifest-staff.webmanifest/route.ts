import { buildStaffPwaManifest } from '@/shared/lib/pwa/staffPwaManifest';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

export async function GET() {
  const resolved = await getResolvedSurface();
  return Response.json(buildStaffPwaManifest(resolved), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
