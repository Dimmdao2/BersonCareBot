"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { addSymptomEntry } from "./actions";

type TrackingOption = { id: string; symptomTitle: string | null };

/** Градиент от зелёного (0) к жёлтому (5) к бордовому (10) — как в плане этапа 1. */
function getScoreColor(score: number): string {
  if (score <= 5) {
    const t = score / 5;
    const h = 120 + (45 - 120) * t;
    const s = 60 + (80 - 60) * t;
    const l = 40 + (50 - 40) * t;
    return `hsl(${h} ${s}% ${l}%)`;
  }
  const t = (score - 5) / 5;
  const h = 45 + (0 - 45) * t;
  const s = 80 + (70 - 80) * t;
  const l = 50 + (35 - 50) * t;
  return `hsl(${h} ${s}% ${l}%)`;
}

export function AddEntryForm({ trackings }: { trackings: TrackingOption[] }) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);

  if (trackings.length === 0) {
    return null;
  }

  const single = trackings.length === 1;

  return (
    <form action={addSymptomEntry} className="stack">
      {single ? (
        <input type="hidden" name="trackingId" value={trackings[0].id} />
      ) : (
        <label className="stack">
          <span className="eyebrow">Симптом</span>
          <select
            id="symptom-entry-tracking"
            name="trackingId"
            className="auth-input"
            required
            defaultValue={trackings[0]?.id}
          >
            {trackings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.symptomTitle ?? "—"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="stack">
        <span className="eyebrow">Интенсивность (0–10)</span>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 11 }, (_, i) => {
            const color = getScoreColor(i);
            const active = selectedValue === i;
            return (
              <button
                key={i}
                type="button"
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
                  active ? "border-transparent text-white" : "border-solid bg-transparent",
                )}
                style={
                  active
                    ? { backgroundColor: color, borderColor: color }
                    : { borderColor: color, color }
                }
                onClick={() => setSelectedValue(i)}
                aria-pressed={active}
              >
                {i}
              </button>
            );
          })}
        </div>
        <input
          type="hidden"
          name="value"
          value={selectedValue !== null ? String(selectedValue) : ""}
        />
      </div>
      <label className="stack">
        <span className="eyebrow">Тип записи</span>
        <select id="symptom-entry-type" name="entryType" className="auth-input" required defaultValue="instant">
          <option value="instant">В моменте</option>
          <option value="daily">За день</option>
        </select>
      </label>
      <label className="stack">
        <span className="eyebrow">Заметки (необязательно)</span>
        <textarea id="symptom-entry-notes" name="notes" className="auth-input" rows={3} />
      </label>
      <button type="submit" className="button" disabled={selectedValue === null}>
        Сохранить запись
      </button>
    </form>
  );
}
