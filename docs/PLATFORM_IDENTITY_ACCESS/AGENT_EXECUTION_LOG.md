# Platform Identity & Access — журнал выполнения

Вести по мере реализации (по образцу других инициатив в `docs/`).

| Дата | Действие | Ссылка PR / коммит | Примечание |
|------|----------|-------------------|------------|
| — | Созданы план и спецификация | — | `MASTER_PLAN.md`, `SPECIFICATION.md`, `SCENARIOS_AND_CODE_MAP.md` |
| 2026-04-10 | Ужесточение плана по ревью: порядок фаз B→C→D, DoD, три модуля, API=UI policy, onboarding на сервере, tg:… как арх. решение, observability | — | Синхронно обновлены `SPECIFICATION.md` (§3–§5, §14–§15), `README.md`, `SCENARIOS_AND_CODE_MAP.md` |
| 2026-04-10 | **Фаза A (EXEC):** типы access context, `resolvePlatformAccessContext`, trusted phone policy (`TrustedPatientPhoneSource`), колонка `patient_phone_trust_at` + writers (OTP, integrator projection, OAuth Yandex, merge); `isPlatformUserUuid` в shared; обновлён §8 `SCENARIOS_AND_CODE_MAP.md` | — | Маршрутные guards пока не переведены на tier (фаза D). |
| 2026-04-10 | **Фаза A (уточнение контракта):** в `PlatformAccessContext` поле **`tier`** вместо `clientTier` (выравнивание с SPECIFICATION §3 / MASTER §5); `trustedPatientPhoneWriteAnchor` у доверенных writers + re-export | — | Поведение tier на чтении без изменений; якоря только для связи кода с enum. |
| 2026-04-10 | **Фаза A (FIX):** `isTrustedPatientPhoneActivation` в `trustedPhonePolicy` (единственная read-side проверка §5); `GET /api/me` добавляет **`platformAccess`** из `resolvePlatformAccessContext` (SPEC §6); Mini App `patientMessengerContactGate` при наличии `platformAccess` снимает гейт только при `tier === "patient"` | — | Меняет поведение UI гейта при телефоне в сессии без `patient_phone_trust_at`. |
