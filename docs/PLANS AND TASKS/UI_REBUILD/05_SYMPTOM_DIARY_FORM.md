# Этап 5: Дневник симптомов — форма добавления записи

**Задачи:** P-13, P-14

## Цель

Заменить надпись «Добавить симптом или запись можно в боте» на рабочую форму добавления записи прямо в webapp. Добавить возможность создать новый трекинг (симптом) если их нет.

## Шаги

### Шаг 5.1: Создать server action для добавления записи и трекинга

**Создать файл:** `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts`

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function addSymptomEntry(formData: FormData) {
  const session = await requirePatientAccess();
  const trackingId = (formData.get("trackingId") as string)?.trim();
  const valueRaw = formData.get("value") as string;
  const value = parseInt(valueRaw, 10);
  const entryType = (formData.get("entryType") as string) || "instant";
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  if (!trackingId || isNaN(value) || value < 0 || value > 10) return;

  const deps = buildAppDeps();
  await deps.diaries.addSymptomEntry({
    userId: session.user.userId,
    trackingId,
    value0_10: value,
    entryType: entryType as "instant" | "daily",
    notes,
    source: "webapp",
  });
  revalidatePath("/app/patient/diary/symptoms");
}

export async function createSymptomTracking(formData: FormData) {
  const session = await requirePatientAccess();
  const title = (formData.get("symptomTitle") as string)?.trim();
  if (!title) return;

  const deps = buildAppDeps();
  await deps.diaries.createSymptomTracking({
    userId: session.user.userId,
    symptomTitle: title,
  });
  revalidatePath("/app/patient/diary/symptoms");
}
```

### Шаг 5.2: Создать компонент формы добавления записи

**Создать файл:** `apps/webapp/src/app/app/patient/diary/symptoms/AddEntryForm.tsx`

```tsx
"use client";

import { useState } from "react";
import { addSymptomEntry } from "./actions";

type Tracking = { id: string; symptomTitle: string | null };

type Props = {
  trackings: Tracking[];
};

export function AddEntryForm({ trackings }: Props) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);

  if (trackings.length === 0) return null;

  return (
    <form action={addSymptomEntry} className="stack" style={{ gap: 12 }}>
      {/* Выбор симптома */}
      {trackings.length === 1 ? (
        <input type="hidden" name="trackingId" value={trackings[0].id} />
      ) : (
        <div>
          <label className="eyebrow" htmlFor="symptom-tracking-select" style={{ display: "block", marginBottom: 4 }}>
            Симптом
          </label>
          <select id="symptom-tracking-select" name="trackingId" required className="auth-input">
            {trackings.map((t) => (
              <option key={t.id} value={t.id}>{t.symptomTitle ?? "—"}</option>
            ))}
          </select>
        </div>
      )}

      {/* Шкала 0-10 */}
      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>
          Оценка (0 — нет боли, 10 — максимальная)
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`button ${selectedValue === i ? "clients-filters__btn--active" : ""}`}
              style={{ minWidth: 40, padding: "8px 0", fontSize: "0.9rem" }}
              onClick={() => setSelectedValue(i)}
            >
              {i}
            </button>
          ))}
        </div>
        <input type="hidden" name="value" value={selectedValue ?? ""} />
      </div>

      {/* Тип записи */}
      <div>
        <label className="eyebrow" htmlFor="symptom-entry-type" style={{ display: "block", marginBottom: 4 }}>
          Тип
        </label>
        <select id="symptom-entry-type" name="entryType" className="auth-input">
          <option value="instant">В моменте</option>
          <option value="daily">За день</option>
        </select>
      </div>

      {/* Комментарий */}
      <div>
        <label className="eyebrow" htmlFor="symptom-notes" style={{ display: "block", marginBottom: 4 }}>
          Комментарий (необязательно)
        </label>
        <textarea
          id="symptom-notes"
          name="notes"
          className="auth-input"
          rows={2}
          placeholder="Как вы себя чувствуете..."
        />
      </div>

      <button type="submit" className="button" disabled={selectedValue === null}>
        Сохранить запись
      </button>
    </form>
  );
}
```

### Шаг 5.3: Создать компонент формы нового трекинга (P-14)

**Создать файл:** `apps/webapp/src/app/app/patient/diary/symptoms/CreateTrackingForm.tsx`

```tsx
"use client";

import { createSymptomTracking } from "./actions";

export function CreateTrackingForm() {
  return (
    <form action={createSymptomTracking} className="stack" style={{ gap: 12 }}>
      <p style={{ fontSize: "0.9rem", color: "#5f6f86" }}>
        Добавьте симптом, который хотите отслеживать (например: «Боль в спине», «Головная боль»).
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          name="symptomTitle"
          className="auth-input"
          placeholder="Название симптома"
          required
        />
        <button type="submit" className="button">
          Добавить
        </button>
      </div>
    </form>
  );
}
```

### Шаг 5.4: Обновить страницу дневника симптомов

**Файл:** `apps/webapp/src/app/app/patient/diary/symptoms/page.tsx`

Заменить hero-card с текстом «Добавить симптом или запись можно в боте» на формы:

**Найти:**
```tsx
<section id="patient-symptoms-diary-hero-section" className="hero-card stack">
  <p>Отслеживаемые симптомы и история записей. Добавить симптом или запись можно в боте.</p>
</section>
```

**Заменить на:**
```tsx
<section id="patient-symptoms-diary-hero-section" className="hero-card stack">
  <h2>Добавить запись</h2>
  {trackings.length > 0 ? (
    <AddEntryForm trackings={trackings} />
  ) : (
    <p className="empty-state">Добавьте симптом для начала отслеживания.</p>
  )}
</section>
<section id="patient-symptoms-add-tracking-section" className="panel stack">
  <h2>Добавить симптом</h2>
  <CreateTrackingForm />
</section>
```

Добавить импорты вверху файла:
```tsx
import { AddEntryForm } from "./AddEntryForm";
import { CreateTrackingForm } from "./CreateTrackingForm";
```

### Шаг 5.5: Проверить совместимость типов

Убедиться, что `deps.diaries.addSymptomEntry` принимает объект с полями `{ userId, trackingId, value0_10, entryType, notes, source }`. Если интерфейс отличается — адаптировать action.

Убедиться, что `deps.diaries.createSymptomTracking` принимает `{ userId, symptomTitle }`. Если интерфейс отличается — адаптировать action.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Страница дневника симптомов показывает форму добавления записи (шкала 0–10, тип, комментарий).
3. При отсутствии трекингов — показывает форму «Добавить симптом».
4. Создание трекинга работает → появляется в списке.
5. Добавление записи работает → появляется в статистике.
6. Нет надписи «Добавить симптом или запись можно в боте».
