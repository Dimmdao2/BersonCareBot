import { buildPatientPwaManifest } from '@/shared/lib/pwa/patientPwaManifest';
import { getResolvedSurface } from '@/shared/lib/surface/requestSurface.server';

/**
 * Тот же URL и то же тело, что отдавал file-based `app/manifest.ts`. Route handler нужен, чтобы
 * ссылку на манифест ставил единственный резолвер поверхности, а не Next автоматически —
 * см. `shared/lib/pwa/patientPwaManifest.ts`.
 */
export async function GET() {
  const resolved = await getResolvedSurface();
  return Response.json(buildPatientPwaManifest(resolved), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
