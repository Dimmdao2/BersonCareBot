# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-06-20 — Planner (Opus), фаза планирования (§3)
- Прочитан канон `docs/AGENT_AUTORUN_SCHEME.md` (§3/§6/тиринг ⚖️/acceptance 🎯), `orch/roles/ROLE_PROMPTS_v3.md` (роль Planner), `AGENTS.md` + `.cursor/rules/*` (список).
- READ-ONLY исследование кода (грепы + чтение). **Ключевая находка:** абонементы УЖЕ существуют как зрелая подсистема `modules/memberships` + таблицы `be_subscription_packages`/`be_patient_packages`/`be_package_usages` (миграции 0094/0095/0105). Частично закрыты боли #3 (календарь ✅-пометка+фильтр) и #5 (KPI-виджет в «Обзоре»). Боль #1 есть, но на вкладке «Записи», не «Финансы». Боль #2 (bulk-«Пересчитать») — НЕТ. Боль #4 (признак на визите) — НЕТ.
- Создана инфра инициативы: `REQUIREMENTS.md` (боли дословно + карта покрытия), `ROADMAP.md` (ST-01..ST-07, backend/ui разделены, тиринг по риску), `OPEN_QUESTIONS.md` (OQ-1..OQ-11), `LOG.md`, `audit/`.
- Код НЕ менялся (READ-ONLY). Dev-сервер не поднимался.

### НАШЁЛ/ИЗМЕНИЛ (инструментация §⚖️)
`НАШЁЛ: да | Существующая система абонементов modules/memberships + be_*_packages (миграции 0094/0095/0105): создание с soldAt, ledger be_package_usages, balanceCalculator, FEFO, doctor-панель DoctorClientMembershipsPanel на вкладке «Записи», календарь ✅-пометка+фильтр «По абонементу» (ScheduleCalendarTab), KPI-виджет Package в «Обзоре». Финансы-вкладка (PatientTabFinances) работает с ОТДЕЛЬНОЙ patient_payment (cash/acquiring) — абонемента там нет. Net-new: bulk-«Пересчитать» (списать прошедшие записи в окне [soldAt; now]), вывод во «Финансы», признак абонемента в проекции визита (listVisits). ИЗМЕНИЛ КОД: нет (планирование, READ-ONLY).`
