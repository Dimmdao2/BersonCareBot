import { buildPatientPwaManifest } from '@/shared/lib/pwa/patientPwaManifest';

/**
 * Тот же URL и то же тело, что отдавал file-based `app/manifest.ts`. Route handler нужен, чтобы
 * ссылку на манифест ставил единственный резолвер поверхности, а не Next автоматически —
 * см. `shared/lib/pwa/patientPwaManifest.ts`.
 */
export function GET() {
  return Response.json(buildPatientPwaManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
