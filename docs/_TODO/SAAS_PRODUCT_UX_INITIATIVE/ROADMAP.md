# Roadmap — SaaS Product UX Discovery

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

> **Статус:** discovery history и provenance. Последний product/UX authority —
> [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md); исполнимый порядок —
> [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) §7.3. Старые phase statuses этого файла не закрывают
> новые пункты owner-review.

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
- собраны owner rulings, product docs, route/layout baseline и orchestration canon;
- `OWNER_RULINGS_2026-07-16.md` является высшим authority внутри UX initiative и побеждает производные
  requirements/operating/journeys/branding/IA/prototype/audit тексты; Foundation rulings сохраняют приоритет только
  в foundation/tenant/enforcement scope.

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

**Исполнители:** два независимых explorer-а на `gpt-5.6-terra` Medium; затем отдельный reviewer на `gpt-5.6-terra` High проверяет полноту. Повторяющуюся сборку route/screenshot index можно отдать `gpt-5.6-luna` Medium после фиксации формата. Это evidence pass, не работа главного Planner.

**Выход:** `SCREEN_INVENTORY.md`, screenshot index и gap list. Никаких code changes.

Итог: route allocation `150/150`; role-matrix evidence собрано для public, registration, staff boundaries и patient
booking/treatment/profile/settings/navigation. Maintenance/test-lock снят в current DEV контролируемой
owner-authorized операцией. Fresh independent audit подтвердил `71 = 66 valid + 5 finding-only` и закрыл UX-01 с
**PASS**. Patient Today остаётся документированным product defect `organization_principal_required`, а не valid
screen capture.

## UX-02 — Внешнее исследование рабочих SaaS-паттернов

**Статус:** completed; independent research audit PASS.

**Цель:** не изобретать onboarding, paid-brand/custom-domain и role IA с нуля.

Исследовательские треки:

- practice-management / digital-care продукты: specialist acquisition, clinic workspace, patient portal, staff invite;
- install/deep-link, email invite и custom-domain/paid-brand contracts;
- platform admin SaaS analytics и organization lifecycle.

Требования к источникам:

- официальные help centers, product docs и техническая документация;
- дата доступа и прямые ссылки;
- факты отдельно от выводов для BersonCare;
- не копировать чужой UI, извлекать operating patterns и failure states.

**Исполнители:** product researcher и technical researcher на `gpt-5.6-terra` Medium; technical/domain выводы проверяет architecture reviewer на `gpt-5.6-sol` High.

**Выход:** `EXTERNAL_PATTERNS.md` с pattern comparison и применимостью.

Фактические выходы: `UX02_PRODUCT_PATTERNS.md`, `UX02_TECHNICAL_PATTERNS.md`,
`UX02_RESEARCH_AUDIT.md`.

## UX-03 — Product operating model и role/capability matrix

**Статус:** latest owner clarifications integrated; current full independent re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**.

**Цель:** определить, кто, в каком контексте и над какими объектами работает.

Нужно закрыть:

- global admin vs organization management vs clinical work;
- solo specialist vs clinic onboarding;
- owner/admin, который одновременно specialist;
- assistant/reception future compatibility without launch UI;
- «мои пациенты / все пациенты организации»;
- solo-mode vs clinic-mode composition: team context, collaboration actions и отсутствие лишнего clinic UI у solo;
- visit-based transition between specialists without a handoff lifecycle;
- clinic patient record model: отдельные specialist-карточки против единой organization-scoped карточки;
- history access и фильтры `мои визиты / вся история / конкретный специалист`, отдельно от permission enforcement;
- patient multi-org context и specialist attribution;
- public/onboarding/patient границы;
- entitlement influence на IA.

**Исполнитель:** Planner на `gpt-5.6-sol` Medium синтезирует UX-01/02. **Plan-critic:** независимый `gpt-5.6-sol` High проверяет полноту и не позволяет подменить owner decisions догадками. Он же проверяет согласованность с identity/tenant walls как критической областью.

**Выход:** `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, state/context diagrams.

Текущий synthesis собран в `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md`: solo-first launch, одна карточка
организации, visit-based specialist visibility, простая management-поверхность owner-specialist, last-active org и
platform-app switcher. Assistant/reception и multi-specialist clinic остаются future-only. Independent plan-critic
**PASS** в `UX03_INDEPENDENT_AUDIT.md` относится к pre-ruling версии; актуальная cross-contract проверка записана в
`LOG.md`.

## UX-04 — Acquisition, invite, activation и install journeys

**Статус:** latest owner clarifications integrated; current full independent re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**.

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

**Исполнители:** UX flow designer на `gpt-5.6-terra` High и независимый identity/security reviewer на `gpt-5.6-sol` High.

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

**Статус:** latest owner clarifications integrated; current full independent re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**. BD-1/BD-4 and BD-3/BD-6 are resolved;
BD-2/BD-5 are approved future custom-origin/generated-PWA capability, not launch gates.

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

Для каждой поверхности фиксировать platform-only / organization identity / future full branded organization
surface, fallback, ownership и entitlement. Full branding uses own domain or platform subdomain + org name/logo,
but not a per-clinic layout/theme fork.

Базовый инвариант: Host/domain может подсказать scope entry, но не является authorization. Для начального релиза
каноничен platform domain. Future custom-domain/subdomain PWA будет organization-pinned и может генерироваться из
verified brand/domain settings. Separate native organization app is outside current scope.

**Исполнители:** product/brand UX planner на `gpt-5.6-terra` High и architecture/security reviewer на `gpt-5.6-sol` High. Визуальный дизайнер подключается только после contract freeze.

**Выход:** `BRANDING_DOMAIN_CONTRACT.md` и тарифная capability matrix.

Финальные outputs: `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`. После первого полного аудита и
одного integrated correction pass они согласованно разделяют core organization context и paid brand presentation,
`HostnameBase` и независимые surface bindings, стабильный platform alias lifecycle и полную authenticated email
identity. Полный re-audit проверил все исправления и исходные инварианты с **PASS**; audit record:
`UX05_INDEPENDENT_AUDIT.md`. После последних уточнений BD-1/BD-4 и BD-3/BD-6 resolved; BD-2/BD-5 — post-launch
custom-origin/generated-PWA capability. Sender retry/TTL/retention — standards-backed engineering configuration.
Актуальная версия подтверждена current full re-audit; исторические records остаются в `LOG.md`.

## UX-06 — Target IA и screen composition

**Статус:** latest owner clarifications integrated into target IA/screen composition; current full independent
re-audit `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**.

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

**Исполнитель:** Planner на `gpt-5.6-sol` Medium. Независимый plan-critic на `gpt-5.6-sol` High проверяет буквальное покрытие `REQUIREMENTS.md`; Decomposer на `gpt-5.6-terra` Medium превращает карту в проверяемые screen specifications; механическую route-матрицу после design lock собирает `gpt-5.6-luna` Medium.

**Выход:** `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md`.

Current synthesis covers all declared actor surfaces, responsive navigation, management↔clinical composition,
one-org staff vs multi-org patient context, one-card/history and visit-coordination slots, UX-04 acquisition/invite/
install, UX-05 branding/domain degradation and shared empty/loading/error/permission states. The first full audit
confirmed exact page allocation `150/150`, but failed the phase on one screen-ID registry, registration/multi-state
trace, public responsive navigation and incomplete UX-04→UX-07 handoff. One integrated correction updated the three
existing outputs in place: `TARGET_IA.md` now owns canonical IDs and aliases, `SCREEN_COMPOSITION.md` maps every
canonical/deferred surface and all six UX-04 prototype journeys, and `ROUTE_MIGRATION_MAP.md` preserves exact file
allocation while separately tracing multi-state/query-tab/redirect/mixed pages. Full independent re-audit confirmed
`150/150`, exact `57/57` canonical registry/composition parity, complete responsive navigation and all UX-04 journey
handoffs with **PASS**. This is historical pre-ruling evidence. The integrated owner outcomes are covered by the
full cross-contract audit in `LOG.md`. U0 current-source reconciliation 2026-07-19 preserves `57/57` and supersedes
the live route denominator with `152/152`; the preceding `150/150` statement remains historical audit evidence.
Historical audit record: `UX06_INDEPENDENT_AUDIT.md`.

## UX-07 — Wireframes и scenario prototype

**Статус:** historical pre-ruling prototype evidence. The final two-reviewer re-audit PASS and visual/usability
seals #1/#2 remain valid only for source `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`
and evidence batch `2026-07-15T21-03-18Z`; they do not validate the 2026-07-16 owner rulings. Any revised prototype
scope follows the new independent contract audit.

**Цель:** проверить структуру до изменения рабочего UI.

Прототипировать только ключевые цепочки и их recovery, используя canonical UX-06 screen IDs и UX-04 state IDs:

- specialist landing → signup и owner first-run/security/setup (`ACQ-01…05`);
- historical clinic staff invite acceptance (`STF-01…08`), now deferred outside solo launch;
- patient email invite → OTP → first value → install → installed first launch → push recovery (`PIN-01…09`);
- SMS fallback (`SMS-01…03`) как transport-only branch без auth elevation;
- public booking → exact appointment/enrollment → patient app (`PBK-01…08`);
- returning multi-org switch и denied/revoked deep-link recovery (`MOR-01…05`);
- owner/admin management ↔ clinical work;
- brand/publication → hostname base → independent surface binding, включая degraded fallback;
- manual patient + scheduled/walk-in visit + optional portal link; clinic card uses visit-based visibility and no
  handoff lifecycle, while multi-specialist clinic UI remains future-only.

Сначала low-fidelity flow/wireframe, затем один согласованный visual direction. Не рисовать все существующие CRUD-экраны заново.

**Исполнители:** UI/UX executor на `gpt-5.6-terra` Medium; повторяемые screenshot-проходы на `gpt-5.6-luna` Medium; visual reviewer на `gpt-5.6-terra` High и независимый Chief reviewer на `gpt-5.6-sol` High — только после появления рендера.

**Выходы этой фазы (не создавать дополнительные contract-документы):**

- `UX07_PROTOTYPE_INDEX.md` — карта прототипа, flow/state trace, способ запуска и ограничения;
- `UX07_USABILITY_FINDINGS.md` — наблюдения исполнителя до независимого аудита, не audit verdict;
- `ux07-prototype/index.html` — self-contained static prototype с локальными CSS/JS;
- `.claude/screenshots/SAAS-UX07-PROTOTYPE/<UTC>/` — representative desktop/mobile renders и manifest evidence.
- `UX07_INDEPENDENT_AUDIT.md` — один audit record с двумя независимыми visual/usability review sections и итоговым
  verdict после integrated correction/re-audit, если он потребуется.

**Executor checklist:**

The checklist and evidence counts below describe the historical pre-ruling prototype only. They are superseded for
current normative acceptance and cannot add clinic/assistant/brand work to the solo launch.

- один навигируемый low-fidelity prototype покрывает все цепочки выше и явные error/recovery states;
- desktop/mobile меняют композицию, но не trusted context, CTA priority, authorization или recovery;
- current BersonCare visual language используется как одно направление, без перерисовки всех CRUD;
- staff one-org, patient multi-org, permission-before-filter, core org context, one-way domain fallback и
  transport/auth/relationship separation не нарушены;
- historical OM/BD candidates are labelled as such and yield to the dated owner outcomes;
- нет реальных PII, delivery, application/DB/runtime changes;
- проверены local links/navigation, canonical IDs, UX-04 flow trace, representative viewport renders, browser
  console и `git diff --check`.

Фаза считается завершённой только после полного независимого visual/usability audit всего прототипа и, при
связанных findings, одного integrated correction pass с последующим full re-audit. Executor findings сами по себе
не закрывают UX-07.

Финальный full re-audit независимо повторён двумя reviewers на точном source-bound batch. Каждый проверил 9
scenarios / 73 states × desktop/mobile = `146` renders, `284` declared-action checks и `124` generated public
Support/Documents checks; reviewer #2 дополнительно зафиксировал combined total `408` visible action/history/metadata
checks. Hash/history/focus, public recovery boundaries, historical clinic candidate, neutral/authorized shell, all `42` mobile
drawers, semantics, diagnostics, console/network и overflow прошли без failures. Все 18 PNG и source SHA совпали с
manifest. Итоговый record и оба seal: `UX07_INDEPENDENT_AUDIT.md` §§11–13. Pending OM/BD gates не были превращены в
owner rulings.

## UX-08 — Owner decision packet

**Статус:** latest owner clarifications integrated into packet and dated rulings artifact; current full independent
re-audit `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**.

**Цель:** передать владельцу только решения, реально меняющие продукт.

Пакет не должен спрашивать инженерные детали. В нём остаются короткие альтернативы с последствиями, например:

- понятная граница platform brand vs paid organization branding;
- какие public/directory surfaces входят в первый launch;
- assistant product permissions;
- patient multi-org default context;
- степень отделения organization management от clinical cabinet.

**Исполнитель:** Planner на `gpt-5.6-sol` Medium; независимый critic на `gpt-5.6-terra` High удаляет вопросы, на которые уже есть owner ruling или индустриальный стандарт.

**Выход:** `OWNER_DECISION_PACKET.md` и предусмотренный dated artifact `OWNER_RULINGS_2026-07-16.md`.

Текущий packet сохраняет двенадцать исходных развилок и exact owner outcome: resolved launch, resolved future
capability, excluded future scope или rejected premise. Launch owner product gates = `0`; launch focus = solo specialist;
multi-specialist clinic, assistant/reception и complex clinic communications не задерживают release.
После полного UX-09 audit добавлены два потерянных literal upstream выбора: момент создания patient enrollment при
staff invite и topology коммуникаций organization/specialist/thread. Отдельный provenance registry классифицирует
все остальные explicit вопросы UX-03…05 как existing ruling, architecture/security invariant, planner
recommendation + safe default, engineering policy либо non-blocking future backlog; safe default не назван решением владельца.
Из него исключены уже вынесенные owner rulings, текущие дефекты, инженерные/security invariants, 2FA/token/TTL/RLS/
schema details и вопросы, решаемые индустриальным стандартом. OM/BD gates сведены без дублей; exact provenance,
planner recommendation, отличная от неё временная безопасная граница, affected screens/epics и conditional UX-09
path проверены для каждого пункта.

## UX-09 — Implementation roadmap

**Статус:** latest owner clarifications integrated into implementation roadmap; current full independent re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**. Ни implementation, ни app/DB/runtime
changes этим статусом не разрешены.

**Цель:** после решений разложить реализацию на независимые эпики, не вмешавшись в текущий SaaS-поток.

Порядок зависимости, а не обещание релиза:

1. contracts/data gaps;
2. role/capability guards and organization workspace spine;
3. early patient-context resolver plus specialist signup/staff/patient acquisition;
4. manual patient/visit, clinical card/history and solo communications policy;
5. public landing and organization pages;
6. core branding and global platform configuration/reliability/org operations;
7. only then optional custom domain, sender and per-origin PWA adapters;
8. route/visual consolidation and acceptance.

Каждый epic получает scope, forbidden scope, tests, screenshots/smoke и merge dependency. Декомпозицию ведёт `gpt-5.6-terra` Medium, повторяемые checklist/route-операции — `gpt-5.6-luna` Medium. Реализация идёт по worker (`gpt-5.6-terra` Medium/High) → independent code audit (`gpt-5.6-terra` High) → fixer (`gpt-5.6-terra` или `gpt-5.6-luna` по формализуемости) → критический audit (`gpt-5.6-sol` High при затрагивании identity/tenant/security) → visual seals.

Фактический planned output: `IMPLEMENTATION_ROADMAP.md`. Registry по-прежнему содержит 19 meaningful
leaf stages: отдельный J1 owner `U3S`, независимый ранний resolver `U5A`, acquisition convergence без обратной
зависимости, отдельный communications stage `U5D`, core platform stage `U9` до optional `U8A/B/C` и normative
acyclic dependency registry. Все `UX08-01…12` остаются traced decisions, но pending owner launch gates = `0`; каждый stage имеет
data/API/UI, migration/compat, validation, rollback/degradation, checklist и merge dependency. Full CI привязан к
последнему stage каждой фактически исполняемой фазы. Полный независимый re-audit
`UX09-REAUDIT-20260716-U3B-FULL-01` повторно подтвердил `19 × 14` stage contracts, ацикличный DAG `19/19`,
`57/57`, `150/150`, `12/12` decision gates, `24` provenance choices и весь security/foundation/final checklist.
Предыдущий audit остаётся историческим evidence для pre-ruling версии. Новый roadmap делает solo launch
unconditional, переносит clinic/assistant/custom-domain app ветки в future scope и явно добавляет manual patient
card + scheduled/walk-in visit + later portal identity linking. Текущая версия принята полным cross-contract
историческим аудитом до последних уточнений; current full re-audit PASS, implementation ещё не начиналась.

## Стоп-гейты

- UX-03 не начинается без двух законченных UX-01 inventories и UX-02 evidence.
- UX-06 не начинается без operating model.
- UX-07 не начинается без target IA и screen composition.
- UX-09 не начинается до owner decision packet.
- Ни один implementation agent не запускается из discovery roadmap.

## Final initiative completion gate

**Статус:** latest owner clarifications integrated; current full independent re-audit
`SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**. Historical runs ниже остаются evidence для
предыдущих состояний, а не current seal.

**Final run:** `SAAS-UX-FINAL-REAUDIT-20260716-AF864C-01` на
`af864c2d98bd89421f60c4ed04af0f2499b5b06c`.

- [x] Historical pre-ruling audit covered UX-01…09 scope: roles, solo/clinic, card/history/handoff, multi-org patient,
      specialist landing, signup, email-first invite, optional SMS, activation/install, branding, domains, PWA и
      sender identity.
- [x] Current/target registries воспроизведены: U0 current-source pass 2026-07-19 подтверждает `152/152` current
      routes и `57/57` canonical target compositions; прежний `150/150` результат остаётся датированным evidence.
- [x] UX-01 runtime evidence доступно и согласовано; UX-07 exact source/manifests и оба independent visual seals
      воспроизведены без hash/status drift.
- [x] Owner packet preserves `12/12` original alternatives and dated outcomes/classifications; full independent
      audit verified that no agent recommendation is mislabeled as an owner ruling.
- [x] Implementation roadmap содержит `19 × 14` complete stage contracts; dependency registry `19/19` ацикличен,
      unknown dependencies `0`; Foundation/no-dup/migration/rollback/validation gates сохранены.
- [x] F-FINAL-01 current-source status convergence и F-FINAL-02 integration-canon sync закрыты; orchestration model
      tiers соответствуют действующему `ORCHESTRATION_BINDINGS.md`.
- [x] Initiative delta относительно integration branch остаётся documentation-only; app/DB/runtime implementation
      этой инициативой не заявлена и не начиналась.
- [x] Markdown links/evidence paths, branch history, worktree cleanliness и coordination acknowledgements проверены;
      подробный evidence record находится в `LOG.md`.
