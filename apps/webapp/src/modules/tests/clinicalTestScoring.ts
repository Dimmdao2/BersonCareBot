import { z } from "zod";

/**
 * JSONB `tests.scoring`: обязателен корневой `schema_type`; `measure_items` — список измерений.
 * `qualitative` — без авто-оценки (Q2: только каталог, инстансный UX вне B2).
 * Невалидный legacy JSON → {@link migrateLegacyScoringConfig}; остаток в `raw_text`.
 */
export const CLINICAL_TEST_SCHEMA_TYPES = ["numeric", "likert", "binary", "qualitative"] as const;
export type ClinicalTestSchemaType = (typeof CLINICAL_TEST_SCHEMA_TYPES)[number];

/** Подпись типа шкалы для селектов и превью (не ключ `schema_type`). */
export function clinicalTestSchemaTypeLabelRu(schemaType: ClinicalTestSchemaType): string {
  switch (schemaType) {
    case "numeric":
      return "Одно число в интервале";
    case "likert":
      return "Оценка по баллам";
    case "binary":
      return "Да или нет";
    case "qualitative":
      return "Свободный ввод";
  }
}

const measureItemSchema = z.object({
  measureKind: z.string().min(1).max(200),
  value: z.string().max(4000).nullable().optional(),
  unit: z.string().max(200).nullable().optional(),
  comment: z.string().max(8000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

const measureItemsField = z.preprocess(
  (v) => (Array.isArray(v) ? v : []),
  z.array(measureItemSchema),
);

const scoringNumericSchema = z.object({
  schema_type: z.literal("numeric"),
  measure_items: measureItemsField,
  min_value: z.number().finite().optional(),
  max_value: z.number().finite().optional(),
  step: z.number().finite().positive().optional(),
});

const scoringLikertSchema = z
  .object({
    schema_type: z.literal("likert"),
    measure_items: measureItemsField,
    likert_min: z.number().int().min(-100).max(100),
    likert_max: z.number().int().min(-100).max(100),
  })
  .superRefine((d, ctx) => {
    if (d.likert_max <= d.likert_min) {
      ctx.addIssue({ code: "custom", message: "likert_max must be > likert_min", path: ["likert_max"] });
    }
  });

const scoringBinarySchema = z.object({
  schema_type: z.literal("binary"),
  measure_items: measureItemsField,
  positive_label: z.string().max(200).optional(),
  negative_label: z.string().max(200).optional(),
});

const scoringQualitativeSchema = z.object({
  schema_type: z.literal("qualitative"),
  measure_items: measureItemsField,
});

export const clinicalTestScoringSchema = z.discriminatedUnion("schema_type", [
  scoringNumericSchema,
  scoringLikertSchema,
  scoringBinarySchema,
  scoringQualitativeSchema,
]);

export type ClinicalTestScoring = z.infer<typeof clinicalTestScoringSchema>;

export function normalizeClinicalTestScoringOrder(s: ClinicalTestScoring): ClinicalTestScoring {
  const items = [...s.measure_items].map((it, idx) => ({
    ...it,
    sortOrder: typeof it.sortOrder === "number" ? it.sortOrder : idx,
  }));
  items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const reindexed = items.map((it, idx) => ({ ...it, sortOrder: idx }));
  return { ...s, measure_items: reindexed };
}

export function parseClinicalTestScoring(raw: unknown): ClinicalTestScoring | null {
  const p = clinicalTestScoringSchema.safeParse(raw);
  if (!p.success) return null;
  return normalizeClinicalTestScoringOrder(p.data);
}

/**
 * Best-effort: узнаваемый новый формат → как есть; иначе qualitative + пустые measure_items,
 * а сырой JSON уходит в примечание для `raw_text`.
 */
export function migrateLegacyScoringConfig(scoringConfig: unknown): {
  scoring: ClinicalTestScoring | null;
  rawNote: string | null;
} {
  if (scoringConfig == null) return { scoring: null, rawNote: null };
  const parsed = clinicalTestScoringSchema.safeParse(scoringConfig);
  if (parsed.success) {
    return { scoring: normalizeClinicalTestScoringOrder(parsed.data), rawNote: null };
  }
  let serialized: string;
  try {
    serialized =
      typeof scoringConfig === "string" ? scoringConfig : JSON.stringify(scoringConfig, null, 2);
  } catch {
    serialized = String(scoringConfig);
  }
  return {
    scoring: { schema_type: "qualitative", measure_items: [] },
    rawNote: `Legacy scoring_config (JSON):\n${serialized}`,
  };
}
