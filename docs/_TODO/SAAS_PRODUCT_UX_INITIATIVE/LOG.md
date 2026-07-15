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

## 2026-07-15 — UX-04 entry/invite journey draft

- Подготовлены `ENTRY_AND_INVITE_JOURNEYS.md` и `UX04_SCREEN_STATE_LIST.md` для семи обязательных journey: solo
  signup, clinic staff invite, patient email invite, SMS fallback, public booking, returning multi-org patient и
  terminal/wrong-recipient invite recovery.
- Для каждого flow зафиксированы trigger, actor, channel, token/trust, auth, trusted organization source,
  relationship records/state, UI, delivery outcome, recovery и privacy/security.
- Current implementation отделён от target: specialist signup и staff invite имеют reuse points; patient invite не
  найден; public booking ещё не гарантирует atomic enrollment; 2FA отсутствует; patient context switcher не завершён.
- Сохранены owner gates OM-2/OM-3, enrollment timing, 2FA policy, SMS-only activation, role collision, booking
  activation channel и TTL/resend. До решений указаны fail-closed defaults.
- Application/DB/delivery state не менялись. UX-04 остаётся pending до независимого identity/security audit.

## 2026-07-15 — UX-05 branding/domain contract draft

- Добавлены `BRANDING_DOMAIN_CONTRACT.md` и `BRANDING_CAPABILITY_MATRIX.md`; application code, schema, DB и тарифы
  не менялись.
- Для platform landing, org public/profile, booking, join/auth, patient/staff shells, PWA, email/SMS/push,
  legal/support и domain settings описаны уровни platform-only / organization identity / true white-label,
  fallback, ownership, entitlement/readiness и security boundary.
- Host/domain закреплён только как server-verified entry candidate, не authorization. Canonical platform fallback
  однонаправленный и loop-safe; raw invite token/open redirect не переносятся между origins.
- `branding`, `custom_domain`, custom sender и per-origin PWA разведены как независимые capability/readiness axes;
  текущие два entitlement mechanics недостаточны для честной отдельной упаковки sender/PWA.
- Custom sender failure оставлен pending gate BD-3: explicit platform fallback versus hold/reject. Safe default:
  transactional mail через disclosed platform sender, custom-only marketing held. На момент draft provenance label
  был неточным; integrated correction ниже явно фиксирует `owner ruling=none`.
- Статус draft на этом checkpoint был **pending independent product/architecture audit**; он не считался contract freeze.

## 2026-07-15 — UX-05 integrated correction after independent audit

- Один целостный correction pass обновил существующие `BRANDING_DOMAIN_CONTRACT.md` и
  `BRANDING_CAPABILITY_MATRIX.md`; новый конкурирующий contract не создавался, audit record не изменялся.
- Разделены `HostnameBase` (ownership/TLS/routing/base health/decommission/quarantine) и независимые
  `HostnameSurfaceBinding` для public profile, booking, join, auth, patient PWA и staff PWA. Failure одного binding
  не выключает готовые sibling surfaces; management UI показывает base health и отдельную таблицу bindings.
- Core organization context (trusted display name/minimum attribution/platform disclosure) отделён от paid brand
  presentation на public, booking, join/auth, patient/staff, email/SMS/push, legal/support и domain management.
  Отключение `branding` возвращает platform visuals, но не скрывает организацию в valid invite/booking/shell или
  transactional delivery.
- Добавлен server-owned `PlatformAlias` lifecycle: normalization/reserved names/uniqueness, immutable organization
  target, versioned rename redirect, hidden/suspended/closed behavior, quarantine и no silent reuse.
- Email sender `active` теперь требует согласованную identity: visible From, envelope/Return-Path, DKIM selector,
  SPF, DMARC alignment, provider verification, validated Reply-To, bounce/complaint routing и template eligibility;
  per-attempt audit фиксирует effective identity/fallback без body/raw token.
- BD-1…BD-6 переименованы в pending owner decision requests: `status=pending`, `owner ruling=none`, planner
  recommendation, safe default и downstream impact. Собственные рекомендации агента не атрибутированы владельцу.
- Повторно сохранены исходные инварианты: Host/alias/brand не авторизуют, fallback custom→platform однонаправленный,
  platform manifests стабильны, legal/support/recovery достижимы, patient multi-org не мутирует installed identity.
- Статус UX-05: **integrated correction complete; awaiting full independent re-audit**. UX-05 пока не closed.

## 2026-07-15 — UX-05 full independent re-audit

- Повторный аудитор перечитал всю фазу, corrected contracts, requirements/roadmap, operating/role model, UX-02
  evidence, owner rulings и исходный полный audit; проверка не ограничивалась changed lines.
- Все шесть re-audit gates закрыты: независимые hostname bindings, core context vs paid brand, stable platform alias,
  authenticated email identity, корректный provenance BD-1…BD-6 и отсутствие регрессий исходных инвариантов.
- Повторно подтверждены complete surface coverage, Host/alias non-authorization, one-way loop-safe fallback, stable
  platform manifests, W PWA origin gates, patient multi-org behavior, sender anti-spoofing, entitlement separation и
  постоянная достижимость legal/support/recovery.
- Вердикт: **PASS**. UX-05 закрыт как decision-ready discovery contract. BD-1…BD-6 остаются pending owner requests с
  `owner ruling=none`; implementation gaps остаются входами UX-06/UX-09, а не скрыто готовым backend.
- Audit record обновлён на месте: `UX05_INDEPENDENT_AUDIT.md`; новый audit-файл не создавался. Application code, DB и
  тарифы не менялись.

## 2026-07-15 — UX-04 integrated correction after independent audit

- Один цельный correction pass обновил существующие `ENTRY_AND_INVITE_JOURNEYS.md` и
  `UX04_SCREEN_STATE_LIST.md`; parallel state/journey documents не создавались, audit record не редактировался.
- Patient target приведён к owner ruling passwordless OTP; staff — email + password. Зафиксированы additive
  patient/staff persona или fail-closed linking, а также полные 2FA setup/recovery/replacement/session-revocation
  mechanics при открытой политике factor/roles/grace/step-up.
- Invite relationship, immutable delivery attempts и auth/recipient proof разведены; завершены raw-token exchange,
  URL scrub, narrow continuation, accepted-user replay match и exactly-once concurrency/idempotency contracts.
- Current-state gaps сверены с реализацией: deferred specialist bindings, `challengeId` session reissue, отсутствие
  other-active-org enforcement, full-email pre-auth leak, public booking internal `userId`, неполные lifecycle и
  delivery states.
- Добавлены browser→installed PWA first launch, session/passwordless re-auth, exact authorized org restoration,
  push subscription rotation/revocation и deep-link recovery. UX-04 ожидает один полный независимый re-audit; этап
  не помечен completed.

### Full independent re-audit

- Повторно проверены orchestration canon, полный UX-04, REQUIREMENTS/ROADMAP, operating/role model, owner rulings,
  UX-02 evidence, current code и исходный audit; проверка не ограничивалась changed lines.
- Все F1-F5 закрыты: auth/persona/2FA, current-vs-target honesty, независимые lifecycle axes/token exchange,
  installed-PWA first launch/push recovery и полная parity screen/state list.
- Все семь journeys заново трассированы по trigger/channel/trust, identity/auth, organization context,
  relationship transaction, delivery, privacy и recovery. OM-2/OM-3 и остальные product choices остаются pending,
  architecture/security invariants не переатрибутированы владельцу.
- Вердикт: **PASS**. UX-04 закрыт как decision-ready journey contract; это не закрывает перечисленные implementation
  defects. Audit record `UX04_INDEPENDENT_AUDIT.md` обновлён на месте, новый audit-файл не создан.
- `git diff --check` — PASS; app tests/DB smoke не запускались, application/schema/runtime state не менялись.
