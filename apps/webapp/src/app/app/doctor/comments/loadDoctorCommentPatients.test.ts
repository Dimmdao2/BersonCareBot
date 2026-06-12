import { describe, it, expect } from "vitest";
import { loadDoctorCommentPatients } from "./loadDoctorCommentPatients";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";
const VIEWER = "00000000-0000-4000-8000-00000000000d";

const ITEM1 = "00000000-0000-4000-8000-aaa000000001";
const ITEM2 = "00000000-0000-4000-8000-aaa000000002";
const ITEM3 = "00000000-0000-4000-8000-aaa000000003";

function makeClient(userId: string, displayName: string, phone?: string | null) {
  return {
    userId,
    displayName,
    phone: phone ?? null,
    bindings: { telegramId: null, maxId: null },
  };
}

function makeUnreadRow(patientUserId: string, stageItemId: string) {
  return { patientUserId, stageItemId };
}

function makeDeps(
  clients: ReturnType<typeof makeClient>[],
  unreadRows: ReturnType<typeof makeUnreadRow>[],
) {
  return {
    doctorClientsPort: {
      listClients: async () => clients,
    },
    programItemDiscussion: {
      listUnreadExerciseCommentsForDoctor: async () => unreadRows,
    },
  };
}

describe("loadDoctorCommentPatients", () => {
  it("returns empty when no on-support clients", async () => {
    const deps = makeDeps([], []);
    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(0);
  });

  it("returns empty when clients exist but no unread comments", async () => {
    const deps = makeDeps([makeClient(P1, "Иван Иванов")], []);
    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(0);
  });

  it("returns patients with unread comments with correct unreadCount", async () => {
    const deps = makeDeps(
      [makeClient(P1, "Иван Иванов"), makeClient(P2, "Мария Петрова")],
      [
        makeUnreadRow(P1, ITEM1),
        makeUnreadRow(P1, ITEM2),
        makeUnreadRow(P2, ITEM3),
      ],
    );
    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(2);

    const p1 = result.find((r) => r.patientUserId === P1);
    expect(p1).toBeDefined();
    expect(p1!.unreadCount).toBe(2);
    expect(p1!.displayName).toBe("Иван Иванов");
    expect(p1!.isOnSupport).toBe(true);

    const p2 = result.find((r) => r.patientUserId === P2);
    expect(p2).toBeDefined();
    expect(p2!.unreadCount).toBe(1);
  });

  it("does not include patient with 0 unread", async () => {
    const deps = makeDeps(
      [makeClient(P1, "Иван"), makeClient(P2, "Мария"), makeClient(P3, "Сергей")],
      [makeUnreadRow(P1, ITEM1)],
    );
    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(1);
    expect(result[0]!.patientUserId).toBe(P1);
  });

  it("sorts by unreadCount DESC then displayName ASC", async () => {
    const deps = makeDeps(
      [makeClient(P1, "Антон"), makeClient(P2, "Борис"), makeClient(P3, "Виктор")],
      [
        makeUnreadRow(P3, ITEM1),
        makeUnreadRow(P3, ITEM2),
        makeUnreadRow(P3, ITEM3),
        makeUnreadRow(P1, ITEM1),
        makeUnreadRow(P2, ITEM2),
      ],
    );
    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(3);
    expect(result[0]!.patientUserId).toBe(P3); // 3 unread
    // P1 and P2 both have 1 unread, sorted by displayName
    expect(result[1]!.patientUserId).toBe(P1); // "Антон" < "Борис"
    expect(result[2]!.patientUserId).toBe(P2);
  });

  it("includes search fields: phone, telegramId, maxId", async () => {
    const clientWithBindings = {
      userId: P1,
      displayName: "Иван",
      phone: "+79001234567",
      bindings: { telegramId: "tg_123", maxId: "max_456" },
    };
    const deps = {
      doctorClientsPort: { listClients: async () => [clientWithBindings] },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => [makeUnreadRow(P1, ITEM1)],
      },
    };

    const result = await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER });
    expect(result).toHaveLength(1);
    expect(result[0]!.phone).toBe("+79001234567");
    expect(result[0]!.telegramId).toBe("tg_123");
    expect(result[0]!.maxId).toBe("max_456");
  });

  it("excludedUserIds passed to listClients as audience", async () => {
    let capturedAudience: unknown;
    const deps = {
      doctorClientsPort: {
        listClients: async (_: unknown, audience: unknown) => {
          capturedAudience = audience;
          return [];
        },
      },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => [],
      },
    };

    await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER }, {
      excludedUserIds: ["00000000-0000-4000-8000-eeee00000001"],
    });

    expect(capturedAudience).toEqual({
      excludedUserIds: ["00000000-0000-4000-8000-eeee00000001"],
    });
  });

  it("passes no audience when excludedUserIds is empty", async () => {
    let capturedAudience: unknown = "NOT_CALLED";
    const deps = {
      doctorClientsPort: {
        listClients: async (_: unknown, audience: unknown) => {
          capturedAudience = audience;
          return [];
        },
      },
      programItemDiscussion: {
        listUnreadExerciseCommentsForDoctor: async () => [],
      },
    };

    await loadDoctorCommentPatients(deps, { viewerUserId: VIEWER }, { excludedUserIds: [] });

    expect(capturedAudience).toBeUndefined();
  });
});
