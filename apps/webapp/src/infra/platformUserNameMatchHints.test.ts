import { describe, expect, it, vi } from "vitest";
import { buildNameMatchHintsReport } from "./platformUserNameMatchHints";

describe("buildNameMatchHintsReport", () => {
  it("groups ordered rows by normalized first+last", async () => {
    const d1 = new Date("2020-01-01T00:00:00.000Z");
    const d2 = new Date("2021-01-01T00:00:00.000Z");
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "a1",
            display_name: "A",
            first_name: "Ivan",
            last_name: "Petrov",
            phone_normalized: null,
            integrator_user_id: "1",
            created_at: d1,
            nf: "ivan",
            nl: "petrov",
          },
          {
            id: "a2",
            display_name: "B",
            first_name: "Ivan",
            last_name: "Petrov",
            phone_normalized: "+7900",
            integrator_user_id: "2",
            created_at: d2,
            nf: "ivan",
            nl: "petrov",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const pool = { query } as unknown as import("pg").Pool;

    const report = await buildNameMatchHintsReport(pool, {
      missingPhone: false,
      limitGroups: 10,
      limitMembersPerGroup: 20,
      limitSwappedPairs: 500,
    });

    expect(report.orderedGroups).toHaveLength(1);
    expect(report.orderedGroups[0].normalizedFirst).toBe("ivan");
    expect(report.orderedGroups[0].normalizedLast).toBe("petrov");
    expect(report.orderedGroups[0].members.map((m) => m.id).sort()).toEqual(["a1", "a2"]);
    expect(report.swappedPairs).toHaveLength(0);
    expect(report.disclaimer.length).toBeGreaterThan(20);
  });

  it("maps swapped pair rows", async () => {
    const da = new Date("2019-06-01T00:00:00.000Z");
    const db = new Date("2019-07-01T00:00:00.000Z");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            a_id: "u1",
            a_display_name: "X",
            a_first_name: "Ivan",
            a_last_name: "Petrov",
            a_phone_normalized: null,
            a_integrator_user_id: "10",
            a_created_at: da,
            b_id: "u2",
            b_display_name: "Y",
            b_first_name: "Petrov",
            b_last_name: "Ivan",
            b_phone_normalized: "+7901",
            b_integrator_user_id: "20",
            b_created_at: db,
          },
        ],
      });

    const pool = { query } as unknown as import("pg").Pool;

    const report = await buildNameMatchHintsReport(pool, {
      missingPhone: false,
      limitGroups: 10,
      limitMembersPerGroup: 20,
      limitSwappedPairs: 500,
    });

    expect(report.orderedGroups).toHaveLength(0);
    expect(report.swappedPairs).toHaveLength(1);
    expect(report.swappedPairs[0].userA.id).toBe("u1");
    expect(report.swappedPairs[0].userB.id).toBe("u2");
  });
});
