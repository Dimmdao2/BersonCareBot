import type { AppointmentProjectionPort, AppointmentRecordRow } from "./pgAppointmentProjection";

const recordsByIntegratorId = new Map<
  string,
  {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    branchId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }
>();

function toRow(
  key: string,
  v: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    branchId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }
): AppointmentRecordRow {
  return {
    id: key,
    integratorRecordId: v.integratorRecordId,
    phoneNormalized: v.phoneNormalized,
    recordAt: v.recordAt,
    status: v.status,
    payloadJson: v.payloadJson,
    lastEvent: v.lastEvent,
    branchId: v.branchId ?? null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    deletedAt: v.deletedAt,
  };
}

export const inMemoryAppointmentProjectionPort: AppointmentProjectionPort = {
  async upsertRecordFromProjection(params) {
    const now = new Date().toISOString();
    const existing = recordsByIntegratorId.get(params.integratorRecordId);
    recordsByIntegratorId.set(params.integratorRecordId, {
      integratorRecordId: params.integratorRecordId,
      phoneNormalized: params.phoneNormalized ?? null,
      recordAt: params.recordAt ?? null,
      status: params.status,
      payloadJson: params.payloadJson ?? {},
      lastEvent: params.lastEvent ?? "",
      branchId: params.branchId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: params.updatedAt ?? now,
      deletedAt: existing?.deletedAt ?? null,
    });
  },

  async getRecordByIntegratorId(integratorRecordId: string): Promise<AppointmentRecordRow | null> {
    const v = recordsByIntegratorId.get(integratorRecordId);
    return v ? toRow(integratorRecordId, v) : null;
  },

  async listActiveByPhoneNormalized(phoneNormalized: string): Promise<AppointmentRecordRow[]> {
    const list: AppointmentRecordRow[] = [];
    for (const [key, v] of recordsByIntegratorId) {
      if (
        !v.deletedAt &&
        v.phoneNormalized === phoneNormalized &&
        (v.status === "created" || v.status === "updated")
      ) {
        list.push(toRow(key, v));
      }
    }
    list.sort((a, b) => {
      const at = a.recordAt ?? "";
      const bt = b.recordAt ?? "";
      return at.localeCompare(bt);
    });
    return list;
  },

  async listHistoryByPhoneNormalized(phoneNormalized: string, limit = 50): Promise<AppointmentRecordRow[]> {
    const list: AppointmentRecordRow[] = [];
    for (const [key, v] of recordsByIntegratorId) {
      if (!v.deletedAt && v.phoneNormalized === phoneNormalized) {
        list.push(toRow(key, v));
      }
    }
    list.sort((a, b) => {
      const at = a.recordAt ?? "";
      const bt = b.recordAt ?? "";
      return bt.localeCompare(at);
    });
    return list.slice(0, limit);
  },

  async softDeleteByIntegratorId(integratorRecordId: string): Promise<boolean> {
    const v = recordsByIntegratorId.get(integratorRecordId);
    if (!v || v.deletedAt) return false;
    const now = new Date().toISOString();
    recordsByIntegratorId.set(integratorRecordId, { ...v, deletedAt: now, updatedAt: now });
    return true;
  },
};
