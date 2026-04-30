/** Парсинг `system_settings.patient_home_mood_icons` для главной пациента. */

export type PatientHomeMoodIconOption = {
  score: 1 | 2 | 3 | 4 | 5;
  label: string;
  imageUrl: string | null;
};

const DEFAULT_BY_SCORE: Record<1 | 2 | 3 | 4 | 5, { label: string }> = {
  1: { label: "Очень плохо" },
  2: { label: "Скорее плохо" },
  3: { label: "Нейтрально" },
  4: { label: "Хорошо" },
  5: { label: "Отлично" },
};

function unwrapValueJson(valueJson: unknown): unknown {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

/**
 * Возвращает 5 кнопок настроения (1-5) с label; без картинки из настроек UI показывает стандартные Lucide-иконки.
 */
export function parsePatientHomeMoodIcons(valueJson: unknown): readonly PatientHomeMoodIconOption[] {
  const raw = unwrapValueJson(valueJson);
  const fromDb = new Map<number, { label?: string; imageUrl?: string | null }>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (row === null || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const score = typeof o.score === "number" && o.score >= 1 && o.score <= 5 ? o.score : null;
      if (score === null) continue;
      const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : undefined;
      const imageUrl =
        o.imageUrl === null || o.imageUrl === undefined
          ? null
          : typeof o.imageUrl === "string" && o.imageUrl.trim()
            ? o.imageUrl.trim()
            : null;
      fromDb.set(score, { label, imageUrl });
    }
  }

  const out: PatientHomeMoodIconOption[] = [];
  for (const s of [1, 2, 3, 4, 5] as const) {
    const d = fromDb.get(s);
    const def = DEFAULT_BY_SCORE[s];
    const imageUrl = d?.imageUrl && d.imageUrl.length > 0 ? d.imageUrl : null;
    out.push({
      score: s,
      label: d?.label && d.label.length > 0 ? d.label : def.label,
      imageUrl,
    });
  }
  return out;
}
