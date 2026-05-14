import { describe, expect, it } from "vitest";
import { groupPendingProgramTestEvaluations } from "./groupPendingProgramTestEvaluations";
import type { PendingProgramTestEvaluationRow } from "@/modules/treatment-program/types";

const A_ATT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B_ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C_ATT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeRow(over: Partial<PendingProgramTestEvaluationRow> & Pick<PendingProgramTestEvaluationRow, "resultId">): PendingProgramTestEvaluationRow {
  return {
    attemptId: A_ATT,
    attemptSubmittedAt: "2026-05-01T10:00:00.000Z",
    testId: "t1",
    testTitle: "T1",
    createdAt: "2026-05-01T10:01:00.000Z",
    instanceId: "30000000-0000-4000-8000-000000000001",
    instanceTitle: "Inst",
    stageTitle: "St",
    stageItemId: "40000000-0000-4000-8000-000000000001",
    ...over,
  };
}

describe("groupPendingProgramTestEvaluations", () => {
  it("merges two results of the same attempt into one group", () => {
    const r1 = makeRow({ resultId: "r1111111-1111-4111-8111-111111111111", createdAt: "2026-05-01T10:02:00.000Z" });
    const r2 = makeRow({
      resultId: "r2222222-2222-4222-8222-222222222222",
      testId: "t2",
      createdAt: "2026-05-01T10:01:00.000Z",
    });
    const groups = groupPendingProgramTestEvaluations([r1, r2]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.attemptId).toBe(A_ATT);
    expect(groups[0]!.results.map((r) => r.resultId)).toEqual([
      "r2222222-2222-4222-8222-222222222222",
      "r1111111-1111-4111-8111-111111111111",
    ]);
  });

  it("splits by attempt and orders groups by submittedAt descending", () => {
    const older = makeRow({
      attemptId: B_ATT,
      attemptSubmittedAt: "2026-05-01T08:00:00.000Z",
      resultId: "rbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const newer = makeRow({
      attemptId: C_ATT,
      attemptSubmittedAt: "2026-05-10T12:00:00.000Z",
      resultId: "rccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    const groups = groupPendingProgramTestEvaluations([older, newer]);
    expect(groups.map((g) => g.attemptId)).toEqual([C_ATT, B_ATT]);
  });

  it("tie-break: same attemptSubmittedAt, lexicographically greater attemptId first", () => {
    const ts = "2026-05-01T10:00:00.000Z";
    const low = makeRow({
      attemptId: A_ATT,
      attemptSubmittedAt: ts,
      resultId: "10000000-0000-4000-8000-000000000001",
    });
    const high = makeRow({
      attemptId: B_ATT,
      attemptSubmittedAt: ts,
      resultId: "20000000-0000-4000-8000-000000000002",
    });
    const groups = groupPendingProgramTestEvaluations([low, high]);
    expect(groups.map((g) => g.attemptId)).toEqual([B_ATT, A_ATT]);
  });

  it("sorts results inside a group by createdAt then resultId", () => {
    const sameTime = "2026-05-01T10:05:00.000Z";
    const rA = makeRow({ resultId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: sameTime });
    const rB = makeRow({ resultId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", createdAt: sameTime });
    const groups = groupPendingProgramTestEvaluations([rB, rA]);
    expect(groups[0]!.results.map((r) => r.resultId)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
  });
});
