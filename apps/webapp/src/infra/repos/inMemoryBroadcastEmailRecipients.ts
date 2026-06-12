/**
 * In-memory реализация BroadcastEmailRecipientsPort — для тестов.
 * Этап 4a (2026-06-13).
 */
import type { BroadcastEmailRecipientsPort } from "@/modules/doctor-broadcasts/fanOutBroadcastEmail";

export function createInMemoryBroadcastEmailRecipientsPort(
  emailsByUserId: Record<string, string> = {},
): BroadcastEmailRecipientsPort {
  return {
    async getVerifiedEmailsForUserIds(userIds: string[]): Promise<Map<string, string>> {
      const map = new Map<string, string>();
      for (const uid of userIds) {
        const email = emailsByUserId[uid];
        if (email) {
          map.set(uid, email);
        }
      }
      return map;
    },
  };
}
