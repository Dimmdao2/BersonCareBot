import { randomUUID } from "node:crypto";
import type {
  PlatformUserContactRecord,
  PlatformUserContactsPort,
} from "@/modules/platform-user-contacts/ports";

const rows: PlatformUserContactRecord[] = [];

export function resetInMemoryPlatformUserContactsForTests() {
  rows.length = 0;
}

export function createInMemoryPlatformUserContactsPort(): PlatformUserContactsPort {
  return {
    async listByPlatformUserId(platformUserId) {
      return rows
        .filter((r) => r.platformUserId === platformUserId)
        .sort((a, b) => {
          const tc = a.contactType.localeCompare(b.contactType);
          if (tc !== 0) return tc;
          return a.updatedAt.localeCompare(b.updatedAt);
        });
    },

    async upsertContact(input) {
      const now = new Date().toISOString();
      const idx = rows.findIndex(
        (r) =>
          r.platformUserId === input.platformUserId &&
          r.contactType === input.contactType &&
          r.valueNormalized === input.valueNormalized,
      );
      if (idx >= 0) {
        const prev = rows[idx]!;
        const next: PlatformUserContactRecord = {
          ...prev,
          value: input.value,
          source: input.source,
          updatedAt: now,
        };
        rows[idx] = next;
        return next;
      }
      const created: PlatformUserContactRecord = {
        id: randomUUID(),
        platformUserId: input.platformUserId,
        contactType: input.contactType,
        value: input.value,
        valueNormalized: input.valueNormalized,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(created);
      return created;
    },

    async deleteById(input) {
      const idx = rows.findIndex((r) => r.id === input.id && r.platformUserId === input.platformUserId);
      if (idx < 0) return false;
      rows.splice(idx, 1);
      return true;
    },
  };
}
