import { loadPatientTelegramUsername } from "@/infra/repos/pgPatientTelegramUsernameMention";
import { formatTelegramUsernameMention } from "@/modules/messaging/patientTelegramUsernameMention";

export async function resolvePatientTelegramUsernameMention(platformUserId: string): Promise<string | null> {
  try {
    const username = await loadPatientTelegramUsername(platformUserId);
    return formatTelegramUsernameMention(username);
  } catch {
    return null;
  }
}
