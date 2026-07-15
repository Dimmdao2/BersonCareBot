# Log — SaaS Product UX Initiative

## 2026-07-15 — discovery setup

- Создан изолированный worktree `/home/dev/dev-projects/BersonCareBot-work3`.
- Создана ветка `feat/saas-interface-work3` от `feat/doctor-ui-rebuild` commit `32709c940`.
- Основной worktree и его незакоммиченные orchestration docs не изменялись.
- Создана taskdb-задача `#787`, `status=doing`, `auto_ok=false`.
- Прочитаны базовые repository docs, SaaS owner rulings/sequence, product overview, screen/layout inventory, identity и notification contracts, orchestration canon.
- Через code-search и точечное чтение подтверждены текущие patient/doctor navigation, clinic members/invites и clinic settings.
- Субагенты не запускались: сначала зафиксированы цель, scope и этапность по прямому запросу владельца.

### Подтверждённые стартовые факты

- Текущий `/` ориентирован прежде всего на пациента и PWA install.
- Staff roles и server-derived organization context существуют.
- UI приглашения staff создаёт invite URL; автоматическая email delivery в найденном flow не подтверждена.
- Patient invite/join/install SaaS flow не найден.
- Branding/custom-domain UI не найден; roadmap contract существует.
- Patient и doctor IA уже достаточно развиты, поэтому целевой план должен строиться через reuse/move/merge, а не новый параллельный интерфейс.

### Проверки

- `git status --short --branch` в обоих worktree;
- `git worktree list`;
- code-search до точечного чтения кода;
- taskdb только через `/home/dev/brain/tools/taskdb.mjs`.

## 2026-07-15 — UX-01 started

- Владелец разрешил следующий этап без дополнительных вопросов.
- Запущены два независимых bounded audit-потока: specialist/clinic/global-admin и patient/public/auth/booking/install.
- Один dev-сервер `127.0.0.1:5200` запущен из интеграционного worktree на том же code HEAD; отдельные серверы аудиторам запрещены.
- Зафиксирован baseline universe и independent acceptance gate в `UX01_ACCEPTANCE.md`.
- На этапе разрешены только inventory docs и screenshots; application code, DB и delivery state вне scope.

## 2026-07-15 — UX-01 role-matrix reconciliation

- DEV ранее обновлена из TEST, миграции применены; прежний missing `staff_user_has_password_credentials` blocker снят.
- Reconciled run: `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/`, commit `a537e74df6e5e38d589dd7dc0ec8549dcf848756`.
- Public: clean login desktop/mobile и landing mobile подтверждены.
- Registration: через стандартный DEV admin settings API контролируемо установлен `specialist_signup_enabled=true`; desktop/mobile показывают email, password, specialist name и organization title. Form submit не выполнялся.
- Regular doctor: отдельный shell/nav boundary подтверждён; clinic/global links отсутствуют. Communications capture удалён из-за real-looking restored names/messages.
- Clinic admin: clinic management links и отсутствие global sections подтверждены.
- Global admin: shell, analytics, system health, audit log и promo подтверждены; sensitive settings attempts удалены после privacy review.
- Patient: auth succeeds, но full shell BLOCKED maintenance replacement. `patient_app_maintenance_enabled=true`; TEST-only `system_settings_test_lock`, скопированный в DEV, не даёт изменить setting через стандартный `updateSetting`/API path. Сохранены только desktop/mobile guard frames. Taskdb `#795`.
- Три TEST walkthrough manifests подключены как готовое evidence; superseded Today/legacy appointments/KPI findings не считаются повторно.
- Current selected totals: 64 safe referenced PNG, 59 valid product/role states, 5 finding-only; 14 superseded TEST PNG excluded.
- `UX01_INDEPENDENT_AUDIT.md` оставлен историческим FAIL. Для закрытия UX-01 нужен новый independent audit.

### Fresh independent audit

- Вердикт: **FAIL / UX-01 completion BLOCKED**.
- Подтверждено: allocation `150/150`, все manifests/PNG существуют, counts `64 = 59 valid + 5 finding-only`,
  14 superseded TEST frames исключены, desktop role boundaries корректны, privacy omissions сохранены.
- Единственный обязательный completion blocker: полный patient slice отсутствует из-за maintenance + скопированного
  TEST lock (`#795`). После исправления повторить patient matrix и fresh audit.
- Аудит зафиксирован в `UX01_FRESH_AUDIT_2026-07-15.md`.

## 2026-07-15 — owner addendum: solo vs clinic specialist

- Владелец требует различать UI solo specialist и специалиста клиники.
- Для clinic-mode в discovery добавлены patient handoff/transfer и просмотр истории по всем визитам.
- Открытый продуктовый выбор: отдельные карточки пациента по специалистам или одна organization-scoped карточка
  с фильтрами `мои визиты / вся история / конкретный специалист`.
- Фильтрация не считается authorization: права доступа, attribution и audit trail должны быть определены отдельно
  на UX-03 до screen composition.

## 2026-07-15 — UX-02 external patterns

- Product track: SimplePractice, Jane, Healthie, Practice Better и Cliniko; solo/clinic onboarding, roles,
  invitations, patient record/history, handoff, multi-practice context, branding и platform lifecycle.
- Technical track: trusted invite lifecycle, SMS boundary, PWA/install/push, branding, custom domains/TLS/DNS,
  sender identity и security invariants.
- Owner addendum включён: единая clinic card остаётся preferred candidate для UX-03 comparison, не решением;
  transfer разделён на primary assignment, care team, work-item reassignment и cross-org transfer.
- Independent audit сначала потребовал 3 точечных исправления источников/формулировок; после исправлений — **PASS**.
- Audit record: `UX02_RESEARCH_AUDIT.md`.

## 2026-07-15 — UX-01 patient replay after DEV unblock

- По прямому разрешению владельца в current DEV database-name-guarded операцией удалены скопированные из TEST
  `system_settings_test_lock` trigger/function; стандартный admin API установил
  `patient_app_maintenance_enabled=false`. TEST и PROD не менялись.
- Для synthetic `dev:client` восстановлен active enrollment в organization `a000...0001`; это контролируемая
  мутация свободной DEV UX-песочницы. Application code и внешняя доставка не менялись.
- Replay: `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T17-51-35Z/patient/manifest.md`.
- 7 valid кадров подтверждают booking, treatment/program, profile, notification settings и mobile navigation.
- Desktop/mobile Today — finding-only: после enrollment restoration остаётся
  `organization_principal_required`, самостоятельный RSC/product defect.
- Current selected totals: `71 = 66 valid + 5 finding-only`. Исключены 14 superseded TEST frames и 2
  исторических maintenance frames. Route allocation остаётся `150/150`.
- Исторический `UX01_FRESH_AUDIT_2026-07-15.md` не переписывался; нужен новый independent acceptance audit.

### Fresh patient-replay independent audit

- Вердикт: **PASS — UX-01 factual current-state audit complete**.
- Независимо подтверждены allocation `150/150`, все canonical manifests/files, DEV SHA-256 и dimensions, арифметика
  `71 = 66 valid + 5 finding-only`, исключение 14 superseded TEST и 2 historical maintenance frames.
- Role/privacy boundaries и controlled DEV mutations подтверждены; TEST/PROD, application code и delivery state не
  менялись.
- Patient Today остаётся finding-only product defect `organization_principal_required`. Acceptance требует честно
  сохранять error как finding, а не исправлять продукт внутри factual audit, поэтому defect не блокирует PASS UX-01.
- Новый audit record: `UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md`; прежние FAIL records сохранены историческими.

## 2026-07-15 — UX-03 operating-model synthesis

- Рабочий draft и независимый architecture/security review синтезированы в `OPERATING_MODEL.md` и
  `ROLE_CAPABILITY_MATRIX.md`; исходные файлы не переписывались.
- Канонические identity/tenant/security invariants отделены от recommended candidates и owner decisions.
- Solo и clinic используют одну Organization/account model, но получают разную capability-driven композицию;
  owner/admin+specialist работает в одном login с предложенным явным management/clinical mode.
- Preferred patient-card candidate: одна organization-scoped карточка, authored immutable events, permission before
  filter; решение о модели карточки и clinic-wide history остаётся за владельцем.
- Primary assignment, care team, work-item reassignment и cross-org transfer разведены по state/audit semantics.
- Owner decision packet приоритизирован по блокерам UX-04/05/06. UX-03 не закрыт: требуется independent plan-critic.

### Independent plan-critic

- Initial audit нашёл пять исправимых gaps: неполный row-level ownership/enforcement/provenance contract,
  отсутствующий data/API gap list, неоднозначность owner rulings по clinic-wide wall и global-admin authority,
  несогласованные status/safe defaults и неполные handoff deactivation states.
- `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md` усилены без выбора открытых owner decisions.
- Подтверждены solo/clinic composition, staff one-org vs patient multi-org, permission-before-filter,
  list/direct/count/search/export parity, четыре независимых handoff primitive и entitlement denial semantics.
- Mermaid проверен концептуально; `git diff --check` — PASS.
- Вердикт: **PASS after fixes**. UX-03 закрыт как decision-ready discovery candidate; owner P0/P1 rulings остаются
  downstream gates. Audit record: `UX03_INDEPENDENT_AUDIT.md`.
