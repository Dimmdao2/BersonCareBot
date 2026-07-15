# Roadmap — SaaS Product UX Discovery

## Принцип исполнения

Каждый этап отвечает на один целостный класс вопросов и создаёт только заранее предусмотренный проверяемый
артефакт. Следующий synthesis-этап не стартует, пока входные карты не закончены. Параллельность — максимум два
независимых исследовательских потока; синтез, decision gates и редактирование master-docs сериализуются.

Фаза отдаётся способному агенту целиком: сначала полноценная проработка, затем полноценный независимый аудит всего
результата. Работа не дробится на микрослайсы ради частых diff/test/commit. При связанных замечаниях аудита один
correction owner получает полный контекст, свободу согласованно исправить весь артефакт и затем проходит один полный
re-audit. Цикл узких двухстрочных fix/audit допустим только для действительно изолированной механической ошибки.

Агенту даются время и reasoning, соответствующие объёму. Молчание во время работы, незавершённость из-за времени,
недостаточный контекст и реальная неспособность решить задачу различаются до retry/escalation. Короткий timeout или
неполный scope не трактуется как провал агента. Если интерфейс оркестрации не позволяет выбрать model/effort, это
компенсируется полным контекстом, цельным scope и достаточным временем, а не выдуманной отметкой модели.

Проверки, checklist, `LOG.md`, статусы и документация обновляются на границе содержательной фазы; commit/push — один
осмысленный checkpoint после полного аудита. Новые ad hoc документы не создаются: действующий канон правится на
месте, а отдельные файлы допустимы только как указанный ниже phase output или audit/evidence record. Собственные
решения агентов никогда не записываются как owner rulings.

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

**Статус:** completed; fresh independent acceptance audit PASS.

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

Итог: route allocation `150/150`; role-matrix evidence собрано для public, registration, staff boundaries и patient
booking/treatment/profile/settings/navigation. Maintenance/test-lock снят в current DEV контролируемой
owner-authorized операцией. Fresh independent audit подтвердил `71 = 66 valid + 5 finding-only` и закрыл UX-01 с
**PASS**. Patient Today остаётся документированным product defect `organization_principal_required`, а не valid
screen capture.

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

**Статус:** completed as decision-ready candidate; independent plan-critic PASS. Open owner rulings remain gates for
the named downstream screens, not hidden defaults.

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

Текущий synthesis собран в `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md`. Инварианты, recommended candidates
и owner decisions разведены явно; карточка/история, assistant, handoff, dual-mode navigation и entitlement
degradation не считаются утверждёнными до rulings. Independent plan-critic после исправления row-level ownership /
enforcement / provenance, data/API gaps, owner-ruling boundaries, status/safe defaults и handoff deactivation states
выдал **PASS**. Audit record: `UX03_INDEPENDENT_AUDIT.md`.

## UX-04 — Acquisition, invite, activation и install journeys

**Статус:** completed as a decision-ready journey contract; full independent re-audit PASS after integrated
correction. Open owner decisions remain conditional downstream gates.

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

Corrected outputs: `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md`. Все семь mandatory journeys
сохранены. Integrated correction согласовал owner-approved patient passwordless OTP и staff email+password,
additive persona safety, full 2FA mechanics/recovery, раздельные invite/delivery/proof axes, exactly-once/token
exchange и browser→installed-PWA recovery. Current gaps сверены с кодом, включая deferred specialist binding,
`challengeId` session reissue, missing other-active-org check, pre-auth full-email leak и public booking `userId`.
Полный независимый re-audit проверил F1-F5 и все семь journeys целиком и выдал **PASS**. Audit record обновлён на
месте: `UX04_INDEPENDENT_AUDIT.md`. Current implementation gaps остаются входами UX-06/UX-09, а не скрыто
реализованными возможностями.

## UX-05 — Branding и domain contract

**Статус:** completed as a decision-ready contract; full independent re-audit PASS after integrated correction.
Pending owner requests BD-1…BD-6 have no owner ruling and remain gates for final launch scope and visual freeze.

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

Финальные outputs: `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`. После первого полного аудита и
одного integrated correction pass они согласованно разделяют core organization context и paid brand presentation,
`HostnameBase` и независимые surface bindings, стабильный platform alias lifecycle и полную authenticated email
identity. Полный re-audit проверил все исправления и исходные инварианты с **PASS**; audit record:
`UX05_INDEPENDENT_AUDIT.md`. BD-1…BD-6 остаются pending owner requests (`owner ruling=none`), а не решениями
владельца, и переносятся дальше только как явные decision gates.

## UX-06 — Target IA и screen composition

**Статус:** completed as a decision-safe target IA/screen-composition contract; full independent re-audit PASS after
one integrated correction. Open OM/BD owner gates remain conditional and are not approved target policy.

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

Current synthesis covers all declared actor surfaces, responsive navigation, management↔clinical composition,
one-org staff vs multi-org patient context, decision-safe card/history and handoff slots, UX-04 acquisition/invite/
install, UX-05 branding/domain degradation and shared empty/loading/error/permission states. The first full audit
confirmed exact page allocation `150/150`, but failed the phase on one screen-ID registry, registration/multi-state
trace, public responsive navigation and incomplete UX-04→UX-07 handoff. One integrated correction updated the three
existing outputs in place: `TARGET_IA.md` now owns canonical IDs and aliases, `SCREEN_COMPOSITION.md` maps every
canonical/deferred surface and all six UX-04 prototype journeys, and `ROUTE_MIGRATION_MAP.md` preserves exact file
allocation while separately tracing multi-state/query-tab/redirect/mixed pages. Full independent re-audit confirmed
`150/150`, exact `57/57` canonical registry/composition parity, complete responsive navigation and all UX-04 journey
handoffs with **PASS**. Previously passing role/security/patient/handoff/branding/provenance boundaries remain intact.
Audit record: `UX06_INDEPENDENT_AUDIT.md`.

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
