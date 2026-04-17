# Platform Identity & Access (tier: guest / onboarding / patient)

Единая платформенная модель идентичности и доступа для **webapp**, **интегратора**, **Telegram**, **Max** и проекций (Rubitime и др.).

## Документы

| Файл | Назначение |
|------|------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Генеральный план инициативы: цели, фазы, DoD, риски, связь с другими доками |
| [`SPECIFICATION.md`](SPECIFICATION.md) | Нормативная спецификация: канон, tier, доверие, legacy, инварианты |
| [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) | Подробные сценарии и привязка к модулям/файлам BersonCareBot |
| [`../../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md) | Ops: ручные скрипты/SQL, телефон и `patient_phone_trust_at`, порядок действий вне UI |
| [`../../apps/webapp/scripts/README.md`](../../apps/webapp/scripts/README.md) | Оглавление папки `apps/webapp/scripts` |
| [`PHASE_D_DEEP_AUDIT_REPORT.md`](PHASE_D_DEEP_AUDIT_REPORT.md) | Отчёт глубокого поэтапного аудита фазы D (RSC/API/layout/actions); после **D-FIX 2026-04-11** P1 и часть P2 закрыты — см. вердикт в конце отчёта |
| [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md) | Первичный аудит фазы E (DoD §1–§4 и §8) |
| [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md) | Повторный аудит E, закрытие D-SA-1 (onboarding server actions) |
| [`INDEPENDENT_DEEP_AUDIT_REPORT.md`](INDEPENDENT_DEEP_AUDIT_REPORT.md) | Независимый сквозной аудит по этапам 0–7 (2026-04-11), вердикт и P0–P2 |

## Связь с другими инициативами

- **Канон и merge в БД:** [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md), [`../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`](../PLATFORM_USER_MERGE_V2/MASTER_PLAN.md) — merge остаётся **подстраховкой**; эта инициатива задаёт **access-tier** и **порядок резолва канона до записи сессии**.
- **AUTH / Mini App / бот:** [`../AUTH_RESTRUCTURE/MASTER_PLAN.md`](../AUTH_RESTRUCTURE/MASTER_PLAN.md) — пересечение по входам и гейтам; **контакт (бот + Mini App):** [`../AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`](../AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md); журнал единого гейта — [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) (блок «Единый гейт контакта»).

## Статус

Фазы **A → B → C → C.02 → D → E** (см. `MASTER_PLAN.md` §5) отражены в коде и в `AGENT_EXECUTION_LOG.md`. **Фаза E (2026-04-11):** EXEC + AUDIT + FIX + **повторный аудит** — [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md), [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md). **DoD §1–§4 и §8** закрыты; **D-SA-1** снят (`patientOnboardingServerActionSurfaceOk`). **RSC:** **`patientRscPersonalDataGate`**; **D-TST-1** — `page.warmupsGate.test.tsx`.

**Единый гейт контакта (бот + Mini App):** журнал — блок в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md); сценарий и код — [`../AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`](../AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md), §8 [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md). Регрессия `scripts.json` (нет `webAppUrlFact` / `web_app` при `linkedPhone: false`): `apps/integrator/src/content/userScriptsLinkedPhoneGate.test.ts`.
