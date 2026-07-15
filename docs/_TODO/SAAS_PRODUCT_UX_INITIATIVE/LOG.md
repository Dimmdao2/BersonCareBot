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
