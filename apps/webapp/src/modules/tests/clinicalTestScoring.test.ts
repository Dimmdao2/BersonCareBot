import { describe, expect, it } from "vitest";
import {
  clinicalTestSchemaTypeLabelRu,
  migrateLegacyScoringConfig,
  normalizeClinicalTestScoringOrder,
  parseClinicalTestScoring,
  clinicalTestScoringSchema,
} from "./clinicalTestScoring";

describe("clinicalTestSchemaTypeLabelRu", () => {
  it("returns Russian labels for schema types", () => {
    expect(clinicalTestSchemaTypeLabelRu("numeric")).toBe("Одно число в интервале");
    expect(clinicalTestSchemaTypeLabelRu("likert")).toBe("Оценка по баллам");
    expect(clinicalTestSchemaTypeLabelRu("binary")).toBe("Да или нет");
    expect(clinicalTestSchemaTypeLabelRu("qualitative")).toBe("Свободный ввод");
  });
});

describe("parseClinicalTestScoring", () => {
  it("accepts valid numeric with measure_items", () => {
    const s = parseClinicalTestScoring({
      schema_type: "numeric",
      measure_items: [{ measureKind: "pain", value: "5", unit: null }],
      min_value: 0,
      max_value: 10,
    });
    expect(s?.schema_type).toBe("numeric");
    expect(s?.measure_items).toHaveLength(1);
    expect(s?.measure_items[0]?.sortOrder).toBe(0);
  });

  it("rejects likert when max <= min", () => {
    const r = clinicalTestScoringSchema.safeParse({
      schema_type: "likert",
      measure_items: [],
      likert_min: 1,
      likert_max: 1,
    });
    expect(r.success).toBe(false);
  });

  it("returns null for unknown shape", () => {
    expect(parseClinicalTestScoring({ foo: 1 })).toBeNull();
  });
});

describe("normalizeClinicalTestScoringOrder", () => {
  it("sorts by sortOrder then reindexes", () => {
    const s = normalizeClinicalTestScoringOrder({
      schema_type: "binary",
      measure_items: [
        { measureKind: "b", sortOrder: 2 },
        { measureKind: "a", sortOrder: 0 },
      ],
    });
    expect(s.measure_items.map((m) => m.measureKind)).toEqual(["a", "b"]);
    expect(s.measure_items.map((m) => m.sortOrder)).toEqual([0, 1]);
  });
});

describe("migrateLegacyScoringConfig", () => {
  it("passes through valid structured scoring", () => {
    const payload = {
      schema_type: "qualitative" as const,
      measure_items: [{ measureKind: "note" }],
    };
    const { scoring, rawNote } = migrateLegacyScoringConfig(payload);
    expect(rawNote).toBeNull();
    expect(scoring).toEqual(normalizeClinicalTestScoringOrder(payload));
  });

  it("maps arbitrary JSON to qualitative + rawNote", () => {
    const legacy = { old: true, nested: { x: 1 } };
    const { scoring, rawNote } = migrateLegacyScoringConfig(legacy);
    expect(scoring).toEqual({ schema_type: "qualitative", measure_items: [] });
    expect(rawNote).toContain("Legacy scoring_config");
    expect(rawNote).toContain('"old": true');
  });
});
