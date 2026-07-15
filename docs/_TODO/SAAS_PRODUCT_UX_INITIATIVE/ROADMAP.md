# Roadmap — SaaS Product UX Discovery

## Принцип исполнения

Каждый этап отвечает на один класс вопросов и создаёт отдельный проверяемый артефакт. Следующий synthesis-этап не стартует, пока входные карты не закончены. Параллельность — максимум два независимых исследовательских потока; синтез, decision gates и редактирование master-docs сериализуются.

Текущий UX-01 evidence pass выполнен отдельными bounded аудиторами; synthesis и изменение master-docs остаются сериализованными.

## UX-00 — Boundary и канон

**Статус:** completed.

Результат:

- отдельный worktree/branch;
- taskdb #787;
- зафиксирована граница с текущим SaaS enforcement;
- собраны owner rulings, product docs, route/layout baseline и orchestration canon.

Проверка: `git status -sb`, `git worktree list`, ссылки на канонические документы.

## UX-01 — Фактический аудит текущих экранов

**Статус:** evidence reconciled, fresh independent audit **FAIL / completion BLOCKED by `#795`**.

**Цель:** получить не список файлов, а карту реально доступных экранов и состояний.

Два параллельных потока:

1. Specialist / clinic admin / global admin.
2. Patient / public / auth / booking / install.

Для каждого экрана фиксировать:

- route и entrypoint;
- роль и server guard;
- фактическую задачу экрана;
- layout family;
- ключевые состояния и действия;
- organization/specialist/patient context;
- screenshot на desktop/mobile, где применимо;
- `keep / merge / move / split / retire / needs-decision`;
- найденный gap, без реализации фикса.

**Исполнители:** два bounded UI-auditor/explorer, Sonnet-high или `gpt-5.5`; затем один независимый audit полноты. Это механический evidence pass, не работа Planner.

**Выход:** `SCREEN_INVENTORY.md`, screenshot index и gap list. Никаких code changes.

Текущее состояние: route allocation `150/150`; role-matrix evidence собрано для public, registration и staff boundaries.
Fresh audit подтвердил manifests, counts и role boundaries, но не закрыл этап: patient full shell blocked
maintenance/test-lock state (`#795`). После исправления нужен повтор patient matrix и новый independent audit.

## UX-02 — Внешнее исследование рабочих SaaS-паттернов

**Статус:** completed; independent research audit PASS.

**Цель:** не изобретать onboarding, white-label и role IA с нуля.

Исследовательские треки:

- practice-management / digital-care продукты: specialist acquisition, clinic workspace, patient portal, staff invite;
- PWA install/deep-link, email invite и custom-domain/white-label contracts;
- platform admin SaaS analytics и organization lifecycle.

Требования к источникам:

- официальные help centers, product docs и техническая документация;
- дата доступа и прямые ссылки;
- факты отдельно от выводов для BersonCare;
- не копировать чужой UI, извлекать operating patterns и failure states.

**Исполнители:** один product researcher и один technical researcher, Sonnet-high/`gpt-5.5`; technical/domain выводы проверяет architecture reviewer `gpt-5.6-sol`.

**Выход:** `EXTERNAL_PATTERNS.md` с pattern comparison и применимостью.

Фактические выходы: `UX02_PRODUCT_PATTERNS.md`, `UX02_TECHNICAL_PATTERNS.md`,
`UX02_RESEARCH_AUDIT.md`.

## UX-03 — Product operating model и role/capability matrix

**Цель:** определить, кто, в каком контексте и над какими объектами работает.

Нужно закрыть:

- global admin vs organization management vs clinical work;
- solo specialist vs clinic onboarding;
- owner/admin, который одновременно specialist;
- assistant permissions;
- «мои пациенты / все пациенты организации»;
- solo-mode vs clinic-mode composition: team context, collaboration actions и отсутствие лишнего clinic UI у solo;
- patient handoff/transfer semantics и состояния передачи между специалистами;
- clinic patient record model: отдельные specialist-карточки против единой organization-scoped карточки;
- history access и фильтры `мои визиты / вся история / конкретный специалист`, отдельно от permission enforcement;
- patient multi-org context и specialist attribution;
- public/onboarding/patient границы;
- entitlement influence на IA.

**Исполнитель:** Planner (Opus) синтезирует UX-01/02. **Plan-critic:** независимый Opus проверяет полноту и не позволяет подменить owner decisions догадками. **Architecture reviewer:** `gpt-5.6-sol` проверяет согласованность с identity/tenant walls.

**Выход:** `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, state/context diagrams.

## UX-04 — Acquisition, invite, activation и install journeys

**Цель:** спроектировать полные входные пути.

Обязательные journeys:

1. Solo specialist self-signup → organization owner → first-run setup.
2. Clinic owner → staff email invite → accept → password/2FA → first workspace.
3. Specialist → patient email invite → activation/enrollment → first useful screen → PWA install → push consent.
4. То же с SMS как дополнительным/fallback каналом.
5. Patient через public booking → identity resolution → enrollment → patient app.
6. Returning patient с несколькими организациями.
7. Expired/revoked/replayed/wrong-recipient invite.

Для каждого journey: trigger, actor, channel, token trust, auth step, context source, created records, UI states, notification outcome, recovery.

**Исполнители:** UX flow designer (Opus/`gpt-5.5`) и identity/security reviewer (`gpt-5.6-sol`).

**Выход:** `ENTRY_AND_INVITE_JOURNEYS.md` и screen/state list.

## UX-05 — Branding и domain contract

**Цель:** определить уровни брендинга и технически честные surface boundaries.

Матрица поверхностей:

- platform landing;
- public organization profile;
- booking;
- join/auth;
- patient shell;
- staff shell;
- manifest/name/icons/install;
- email/SMS/push sender presentation;
- legal/support;
- custom-domain verification/status/error/redirect.

Для каждой поверхности фиксировать platform-only / organization identity / white-label, fallback, ownership и entitlement.

Базовый инвариант: Host/domain может подсказать scope entry, но не является authorization. Custom domain должен иметь canonical platform fallback и loop-safe redirect contract.

**Исполнители:** product/brand UX planner + `gpt-5.6-sol` architecture/security reviewer. Визуальный дизайнер подключается только после contract freeze.

**Выход:** `BRANDING_DOMAIN_CONTRACT.md` и тарифная capability matrix.

## UX-06 — Target IA и screen composition

**Цель:** собрать целевую карту экранов по ролям с максимальным reuse текущего продукта.

Артефакты:

- platform public IA;
- global admin IA;
- organization owner/admin IA;
- specialist IA;
- assistant IA;
- patient IA;
- public organization/booking/join IA;
- current route → target screen mapping;
- navigation rules desktop/mobile;
- empty/error/permission states.

**Исполнитель:** Planner (Opus). Независимый plan-critic проверяет буквальное покрытие `REQUIREMENTS.md`; Decomposer (Sonnet-high) превращает карту в проверяемые screen specifications.

**Выход:** `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md`.

## UX-07 — Wireframes и scenario prototype

**Цель:** проверить структуру до изменения рабочего UI.

Прототипировать только ключевые цепочки:

- specialist landing → signup;
- owner first-run;
- patient invite → install;
- patient multi-org switch;
- owner/admin ↔ clinical work;
- branding/custom-domain setup.

Сначала low-fidelity flow/wireframe, затем один согласованный visual direction. Не рисовать все существующие CRUD-экраны заново.

**Исполнители:** UI/UX executor; два независимых visual reviewers по seal-протоколу только после появления рендера.

**Выход:** prototype index и usability findings.

## UX-08 — Owner decision packet

**Цель:** передать владельцу только решения, реально меняющие продукт.

Пакет не должен спрашивать инженерные детали. В нём остаются короткие альтернативы с последствиями, например:

- граница platform brand vs paid white-label;
- какие public/directory surfaces входят в первый launch;
- assistant product permissions;
- patient multi-org default context;
- степень отделения organization management от clinical cabinet.

**Исполнитель:** Planner; независимый critic удаляет вопросы, на которые уже есть owner ruling или индустриальный стандарт.

**Выход:** `OWNER_DECISION_PACKET.md`, затем решения переносятся в отдельный dated rulings file.

## UX-09 — Implementation roadmap

**Цель:** после решений разложить реализацию на независимые эпики, не вмешавшись в текущий SaaS-поток.

Порядок зависимости, а не обещание релиза:

1. contracts/data gaps;
2. role/capability guards;
3. organization management shell;
4. invite/delivery/activation;
5. patient context UX;
6. public landing and organization pages;
7. branding;
8. custom domains;
9. global admin;
10. visual consolidation and acceptance.

Каждый epic получает scope, forbidden scope, tests, screenshots/smoke и merge dependency. Реализация идёт по worker → independent code audit → fixer → risk-tiered audit → visual seals.

## Стоп-гейты

- UX-03 не начинается без двух законченных UX-01 inventories и UX-02 evidence.
- UX-06 не начинается без operating model.
- UX-07 не начинается без target IA и screen composition.
- UX-09 не начинается до owner decision packet.
- Ни один implementation agent не запускается из discovery roadmap.
