"use client";

import { createSymptomTracking } from "./actions";

export function CreateTrackingForm() {
  return (
    <form action={createSymptomTracking} className="stack">
      <p className="empty-state" style={{ marginBottom: 0 }}>
        Укажите название симптома — после сохранения вы сможете вести дневник по нему на этой странице.
      </p>
      <label className="stack">
        <span className="eyebrow">Название</span>
        <input
          type="text"
          name="symptomTitle"
          className="auth-input"
          placeholder="Название симптома"
          required
          autoComplete="off"
        />
      </label>
      <button type="submit" className="button">
        Добавить
      </button>
    </form>
  );
}
