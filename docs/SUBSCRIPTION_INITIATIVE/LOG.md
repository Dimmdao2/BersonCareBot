# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-07-04 — ST-04 (Sonnet), UI: Финансы + «Пересчитать» + Records manual-only

### Что сделано
- **DoctorClientMembershipsPanel.tsx** — добавлен проп `showCreateForm?: boolean` (default: `true`).
  Когда `false` — скрываются секции «Назначить из каталога» и «Индивидуальный абонемент»;
  ручное списание и карточки активных абонементов остаются.
- **DoctorClientMembershipsPanel.tsx** — добавлена кнопка **«Пересчитать»** в `PatientPackageCard`
  (передаётся через prop `onRecalc`). Вызов: `POST /api/doctor/booking-engine/patient-packages/[id]/recalc`.
  Тост успеха: «Списано N сеансов» / «Нет новых сеансов для списания». Ошибка сети/ok:false → toast.error (ненавязчиво, UI не ломается).
- **PatientPackageCard.tsx** — добавлен prop `onRecalc?: () => void`; кнопка «Пересчитать» рядом с «Записи».
- **PatientTabFinances.tsx** — добавлена секция «Абонементы» (Section 2) с полной `DoctorClientMembershipsPanel`
  (`showCreateForm=true`) — полное управление абонементом во вкладке «Финансы».
- **DoctorClientRecordsTab.tsx** — передаётся `showCreateForm={false}` → на вкладке «Записи» только
  ручное списание (форма заведения скрыта).
- **DoctorClientMembershipsPanel.test.tsx** — добавлены тесты: `showCreateForm=false` (скрытие форм),
  «Пересчитать» happy-path (тост «Списано N»), «Пересчитать» с пустым debited (тост «Нет новых»).
  Все 5 тестов зелёные.

### Проверки
- TypeCheck (`tsc --noEmit`): 0 ошибок в изменённых файлах.
- ESLint: 0 ошибок.
- Тесты `DoctorClientMembershipsPanel.test.tsx`: 5/5 passed.

### Решения OQ (применено)
- OQ-1/OQ-3: переиспользована `DoctorClientMembershipsPanel` (не скопирована, не задублирована).
- OQ-2: полное управление — во «Финансы»; на «Записях» (`DoctorClientRecordsTab`) — manual-only.
- OQ-6: тост без предупреждения о нехватке; только «Списано N» / «Нет новых».

## 2026-06-20 — Planner (Opus), фаза планирования (§3)
- Прочитан канон `docs/AGENT_AUTORUN_SCHEME.md` (§3/§6/тиринг ⚖️/acceptance 🎯), `orch/roles/ROLE_PROMPTS_v3.md` (роль Planner), `AGENTS.md` + `.cursor/rules/*` (список).
- READ-ONLY исследование кода (грепы + чтение). **Ключевая находка:** абонементы УЖЕ существуют как зрелая подсистема `modules/memberships` + таблицы `be_subscription_packages`/`be_patient_packages`/`be_package_usages` (миграции 0094/0095/0105). Частично закрыты боли #3 (календарь ✅-пометка+фильтр) и #5 (KPI-виджет в «Обзоре»). Боль #1 есть, но на вкладке «Записи», не «Финансы». Боль #2 (bulk-«Пересчитать») — НЕТ. Боль #4 (признак на визите) — НЕТ.
- Создана инфра инициативы: `REQUIREMENTS.md` (боли дословно + карта покрытия), `ROADMAP.md` (ST-01..ST-07, backend/ui разделены, тиринг по риску), `OPEN_QUESTIONS.md` (OQ-1..OQ-11), `LOG.md`, `audit/`.
- Код НЕ менялся (READ-ONLY). Dev-сервер не поднимался.

### НАШЁЛ/ИЗМЕНИЛ (инструментация §⚖️)
`НАШЁЛ: да | Существующая система абонементов modules/memberships + be_*_packages (миграции 0094/0095/0105): создание с soldAt, ledger be_package_usages, balanceCalculator, FEFO, doctor-панель DoctorClientMembershipsPanel на вкладке «Записи», календарь ✅-пометка+фильтр «По абонементу» (ScheduleCalendarTab), KPI-виджет Package в «Обзоре». Финансы-вкладка (PatientTabFinances) работает с ОТДЕЛЬНОЙ patient_payment (cash/acquiring) — абонемента там нет. Net-new: bulk-«Пересчитать» (списать прошедшие записи в окне [soldAt; now]), вывод во «Финансы», признак абонемента в проекции визита (listVisits). ИЗМЕНИЛ КОД: нет (планирование, READ-ONLY).`
