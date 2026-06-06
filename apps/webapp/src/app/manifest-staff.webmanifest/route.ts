import { buildStaffPwaManifest } from "@/shared/lib/pwa/staffPwaManifest";

export function GET() {
  return Response.json(buildStaffPwaManifest(), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
