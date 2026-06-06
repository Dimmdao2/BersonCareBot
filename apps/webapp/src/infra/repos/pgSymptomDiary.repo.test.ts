import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { pgSymptomDiaryPort } from "./pgSymptomDiary";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uid = "550e8400-e29b-41d4-a716-446655440000";

describe("pgSymptomDiary (runtime constraints)", () => {
  it("uses runWebappPgText only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgSymptomDiary.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("runWebappPgText");
  });
});

describe("pgSymptomDiaryPort (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("listTrackings uses canonical user match", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgSymptomDiaryPort.listTrackings(uid);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("platform_user_id = $1::uuid");
    expect(sql).toContain("platform_user_id IS NULL AND t.user_id = $1::text");
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("ensureGeneralWellbeingTracking uses partial unique ON CONFLICT", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "tr-1",
          user_id: uid,
          platform_user_id: uid,
          symptom_key: "general_wellbeing",
          symptom_title: "Общее самочувствие",
          is_active: true,
          created_at: "2026-06-06T00:00:00.000Z",
          updated_at: "2026-06-06T00:00:00.000Z",
          symptom_type_ref_id: null,
          region_ref_id: null,
          side: null,
          diagnosis_text: null,
          diagnosis_ref_id: null,
          stage_ref_id: null,
          deleted_at: null,
        },
      ],
    });
    const tracking = await pgSymptomDiaryPort.ensureGeneralWellbeingTracking({
      userId: uid,
      symptomTitle: "Общее самочувствие",
      symptomTypeRefId: "ref-1",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("symptom_key = 'general_wellbeing'");
    expect(sql).toContain("ON CONFLICT (platform_user_id) WHERE");
    expect(tracking.symptomKey).toBe("general_wellbeing");
  });
});
