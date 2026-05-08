# symptoms

Раздел симптомов на единой странице дневника: `/app/patient/diary?tab=symptoms` (legacy `/app/patient/diary/symptoms` редиректит сюда через `next.config`).

Пациент видит **назначенные** отслеживания симптомов (в т.ч. созданные врачом или через интегратор/систему). **Новый трекинг из кабинета пациента не создаётся** — UI добавления отключён; `createSymptomTracking` (server action) отвечает **`{ ok: false, reason: "patient_self_create_disabled" }`**; служебный **`general_wellbeing`** (самочувствие с главной) в списках и журнале **скрыт**.

Блок «Отслеживаемые симптомы», формы мгновенной/дневной записи (0–10), статистика и журнал — данные из `deps.diaries` (`listSymptomTrackings`, `listSymptomEntries`, …). Только для пациента.
