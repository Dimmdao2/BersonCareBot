import type { AppSession } from "@/shared/types/session";

/**
 * Phase-04: same bar as `GET /api/media/[id]` — any authenticated session may request playback JSON.
 * Extend here for patient/doctor/content scopes without scattering checks in routes.
 */
export function assertMediaPlaybackAccess(session: AppSession | null): session is AppSession {
  return session != null;
}
