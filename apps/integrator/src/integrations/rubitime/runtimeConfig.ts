import { rubitimeConfig } from './config.js';

export function resetRubitimeRuntimeConfigCache(): void {
  // no-op: retained for test compatibility
}

export async function getRubitimeApiKey(): Promise<string> {
  return rubitimeConfig.apiKey;
}

export async function getRubitimeWebhookToken(): Promise<string> {
  return rubitimeConfig.webhookToken;
}

// NOTE: RUBITIME_SCHEDULE_MAPPING env var has been removed.
// Booking profile mapping (type/category/city -> Rubitime IDs) is now stored in DB.
// See: apps/integrator/src/integrations/rubitime/db/bookingProfilesRepo.ts
