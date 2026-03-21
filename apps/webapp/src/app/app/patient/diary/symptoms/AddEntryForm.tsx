"use client";

import { useState } from "react";
import { addSymptomEntry } from "./actions";

type TrackingOption = { id: string; symptomTitle: string | null };

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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`button ${selectedValue === i ? "clients-filters__btn--active" : ""}`}
              onClick={() => setSelectedValue(i)}
            >
              {i}
            </button>
          ))}
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
