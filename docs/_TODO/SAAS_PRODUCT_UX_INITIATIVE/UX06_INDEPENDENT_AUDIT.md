# UX-06 — Independent full-coverage audit

**Дата:** 2026-07-15  
**Финальный вердикт:** **PASS after integrated correction and full independent re-audit.**  
**Scope:** `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md` целиком против UX-01…05,
`REQUIREMENTS.md` и `ROADMAP.md`. Application code, DB и product artifacts во время аудита не изменялись.

Разделы 1–6 сохраняют исходный FAIL и correction brief как audit history. Действующий re-audit и финальный
вердикт зафиксированы в разделе 7.

## 1. Итог

Содержательная модель UX-06 в основном сильная и пригодна как основа коррекции:

- все actor families присутствуют; system actors корректно не получили пользовательский кабинет;
- platform operations, organization management, clinical work, bounded operations и account разделены;
- solo и clinic используют одну organization/account model, но разную capability-driven композицию;
- owner/admin с specialist binding и без него получают разные безопасные landing surfaces;
- assistant до OM-2 имеет bounded operations shell и safe-denied clinical default;
- patient multi-org, one-card candidate, shared history и handoff не выданы за owner-approved policy;
- authorization выполняется до `Мои / Вся доступная / Specialist X`, включая list/direct/count/search/export parity;
- acquisition, invite, install, branding, domain, sender, fallback и degraded states перенесены из UX-04/05;
- reuse и implementation dependencies не предлагают параллельные solo/clinic или per-specialist route trees.

Однако три артефакта пока нельзя считать однозначным входом UX-07. Проблема не в локальных формулировках, а в
несогласованном screen registry, неполной проекции current multi-state surfaces и потере части уже обязательного
prototype handoff. Ниже дан один цельный correction brief; его не следует дробить на отдельные двухстрочные фиксы.

## 2. Механическая сверка 150 current pages

Фактический список построен командой `find apps/webapp/src/app -type f -name page.tsx`. Из migration map отдельно
извлечены все backtick-ссылки на `apps/webapp/src/app/**/page.tsx` и сопоставлены по точному пути.

```text
actual page files:       150
map references:          150
unique map references:   150
duplicates:                0
missing current files:     0
stale/nonexistent refs:    0

allocation:
platform/public/entry      20
staff/platform             81
patient                    49
total                     150
```

**Результат file-allocation:** PASS, каждый текущий `page.tsx` перечислен ровно один раз.

Это не устраняет F2: один page file в текущем приложении может быть несколькими пользовательскими состояниями и
reuse surfaces. Exact-once file accounting и полная route/state migration semantics — разные проверки.

## 3. Consolidated correction brief

### F1 — Нет одного канонического screen-ID registry между тремя UX-06 артефактами

**Root cause:** IA, compositions и journey screen aliases создавались как три удобных представления, но не были
сведены в одну таблицу идентичности screen/group/state.

Механическая сверка numbered target IDs показала:

```text
TARGET_IA:           55 IDs
SCREEN_COMPOSITION:  56 IDs
ROUTE_MIGRATION_MAP: 40 referenced IDs

in SCREEN_COMPOSITION, absent from TARGET_IA:
ACC-01, ACC-02, ACC-03, ACC-04

in TARGET_IA, absent from SCREEN_COMPOSITION:
OPS-05, ORG-PUB-04, PUB-06
```

При этом `SCREEN_COMPOSITION.md` дополнительно вводит неканонические aliases `MGMT-SETUP`, `MGMT-TEAM`,
`MGMT-INVITE`, `CLIN-PAT-INVITE`, `ACC-FIRST`, `PAT-INSTALL`. Часть из них семантически дублирует `MGMT-01/02`,
`CLIN-02/03`, `ACC-02` и `PAT-11`. `OPS-05 Account` из IA одновременно представлен отдельной общей ACC-family в
composition. Это не продуктовый дубль route tree, но уже документальный дубль identity: UX-07 не может однозначно
понять, является ли alias отдельным экраном, состоянием, flow step или именем существующей composition.

**Correction contract:**

1. В `TARGET_IA.md` определить один master screen registry для всех target IDs, включая ACC-family.
2. Для first-run/invite aliases выбрать один из двух вариантов: отдельный canonical ID либо явно `flow state of
   <canonical screen ID>`; не оставлять параллельное имя без mapping.
3. `OPS-05` свести с ACC-family как shared account destination, а не второй assistant-owned account screen.
4. `PUB-06` и `ORG-PUB-04` либо дать полноценную composition/state mapping, либо явно оформить как gated future
   surface / state of existing canonical screen без самостоятельного screen ID.
5. После нормализации автоматически проверить: каждый ID из migration map существует в IA и composition; каждый
   launch/conditional IA screen имеет composition либо явно обозначенный reason `state-only / deferred-by-gate`.
6. Не создавать четвёртый registry-документ: исправить существующие три артефакта на месте.

### F2 — `150/150` считает файлы, но пропускает известную registration surface внутри `/app`

**Root cause:** allocation unit выбран как page file, а migration target местами описан как user-visible surface.

UX-01 отдельно подтвердил `/app?view=registration` как форму регистрации кабинета специалиста. Current
`apps/webapp/src/app/app/page.tsx` перечислен в P02, но P02 направляет его только в `PUB-04`, `ORG-PUB-03` и
`PAT-10`. Target `PUB-03 Specialist signup` и его прямо заявленный reuse current registration/start-confirm в
`SCREEN_COMPOSITION.md` не отражены в route migration row. Поэтому арифметика верна, а migration semantics для
одного подтверждённого current state — нет.

**Correction contract:**

1. Сохранить exact-once file allocation `150/150`.
2. Для multi-state/multi-view current pages перечислить все подтверждённые target destinations в той же row;
   минимум добавить current registration view → `PUB-03` и зависимость от ACQ-01…05.
3. Сверить аналогичным способом `/app` public/login/registration, query-tab hubs, redirect/deep-link resolvers и
   mixed settings pages: файл остаётся один раз, но все его самостоятельные current surfaces должны иметь target.
4. Не превращать redirect/deep-link resolver в navigation screen; помечать его как compatibility/entry behavior.
5. Повторный аудит должен доказать отдельно `150 files exactly once` и `all inventoried current surfaces mapped`.

### F3 — Responsive navigation contract неполон для public и published-organization actors

**Root cause:** navigation section подробно завершает authenticated staff и patient shells, но считает public
composition самодостаточной.

Desktop/mobile rules есть для platform admin, staff/assistant и patient. Для platform public и organization public
нет явного desktop/mobile navigation contract: header hierarchy, patient secondary entry, signup/demo priority,
profile→booking/join transitions, mobile CTA behavior, legal/support recovery и custom-domain fallback placement.
Это важно именно для specialist-oriented landing и branded organization surfaces, а не визуальная полировка UX-07:
без этого прототип может поменять acquisition hierarchy или спрятать canonical recovery на mobile.

**Correction contract:**

1. Добавить в `TARGET_IA.md` компактные desktop/mobile navigation rules для platform public и organization public.
2. Сохранить specialist acquisition как primary, patient invited/login entry как secondary на обоих breakpoints.
3. Для published organization surface описать переходы profile → service/specialist/location → booking и join,
   видимость platform legal/support и canonical fallback на custom domain.
4. Зафиксировать, что mobile composition меняет presentation, но не trusted context, token exchange, CTA priority и
   recovery availability.
5. Связать эти правила с соответствующими PUB/ORG-PUB compositions, не создавать отдельную mobile IA.

### F4 — UX-07 handoff теряет два обязательных UX-04 prototype journeys

**Root cause:** `SCREEN_COMPOSITION.md` составил новый короткий prototype list вместо полной проекции уже принятого
`UX04_SCREEN_STATE_LIST.md`.

UX-04 буквально требует для UX-07 шесть end-to-end flows, включая `SMS-01…03` fallback без auth elevation и
`PBK-01…08` public booking → portal/patient app. UX-06 handoff сохраняет signup, staff invite, patient invite и
multi-org, но не перечисляет SMS fallback и public booking chain. При этом экранные building blocks в UX-06 есть;
теряется именно обязательство прототипировать связность и recovery.

**Correction contract:**

1. Синхронизировать UX-07 handoff с полной priority list UX-04, не копируя второй набор состояний.
2. Добавить public booking → exact appointment/enrollment/portal activation и SMS fallback как transport-only
   branch того же patient invite.
3. Для каждого prototype flow ссылаться на canonical UX-06 screen IDs и UX-04 state IDs; recovery branches остаются
   частью flow, а не необязательным текстом.
4. Сохранить дополнительные UX-06 flows: management↔clinical, branding/domain и decision-safe clinic card/handoff.

## 4. Whole-phase acceptance trace

| Проверка | Результат |
|---|---|
| Все 150 current page files перечислены ровно один раз | PASS — `150/150`, no duplicate/missing/stale |
| Все current user-visible states имеют target destination | FAIL — registration state `/app?view=registration` не связан с PUB-03 |
| Global admin отделён от clinical shell | PASS |
| Owner/admin management ↔ clinical composition | PASS as safe candidate; OM-1 не выдан за ruling |
| Solo specialist vs clinic specialist | PASS |
| Assistant safe default и direct/list/export boundary | PASS; final permissions остаются OM-2 |
| Patient one/multi-org и direct-object context | PASS; OM-3 сохранён |
| One-card/history alternative и permission-before-filter | PASS as candidate; OM-4/5 не заморожены |
| Primary/care-team/work-item/cross-org handoff semantics | PASS; OM-6/7 сохранены |
| Acquisition/invite/install state coverage | PASS in compositions |
| Branding/domain/sender/PWA degraded states | PASS |
| Shared loading/empty/permission/entitlement/context/error states | PASS |
| Desktop/mobile staff, assistant, platform-admin and patient navigation | PASS |
| Desktop/mobile platform-public and organization-public navigation | FAIL — явный contract отсутствует |
| Canonical target IDs согласованы между тремя outputs | FAIL — ACC/OPS/PUB/ORG-PUB и flow aliases расходятся |
| UX-04 priority journeys полностью переданы UX-07 | FAIL — SMS и public booking отсутствуют в handoff list |
| Current facts, candidates, safe defaults и owner rulings разделены | PASS |
| Parallel solo/clinic/per-specialist IA не создана | PASS |
| Reuse boundaries и implementation dependency order достаточны | PASS, после устранения ID/mapping ambiguity |

## 5. Re-audit gate

Один capable correction owner должен перечитать UX-01…05, этот audit и **целиком** согласованно обновить
`TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md`. Scope — вся UX-06 phase, а не четыре локальных
patch. После этого нужен один независимый full re-audit по исходному checklist, включая:

1. exact `150/150` file allocation и отдельную multi-state surface trace;
2. единую target-ID bijection/alias classification;
3. responsive navigation для всех human actors/public surfaces;
4. полную UX-04 → UX-06 → UX-07 journey trace;
5. сохранность всех прошедших security, role, handoff, branding и owner-gate boundaries.

До re-audit UX-06 остаётся **pending correction**, а UX-07 не должен начинать wireframes по неоднозначным aliases.

## 6. Выполненные проверки

```text
Exact page-file reconciliation (Node + find): PASS, 150/150.
Target-ID set comparison across three UX-06 artifacts: FAIL, mismatches listed in F1.
Manual full-phase trace against REQUIREMENTS/UX-01…05: findings F2-F4.
git diff --check: PASS before audit artifact creation.
```

Application tests, lint, typecheck, build и DB smoke не запускались: аудит меняет только запланированный audit
artifact и не меняет application/schema/runtime state.

## 7. Full independent re-audit after integrated correction — 2026-07-15

### 7.1 Метод и итог

Повторно проверены не только F1–F4 и changed lines, а вся UX-06 phase: `ORCHESTRATION_BINDINGS.md`, literal
`REQUIREMENTS.md`, `ROADMAP.md`, UX-01 inventories/evidence, UX-02 patterns, audited UX-03 operating/capability
model, полные UX-04/05 contracts и audits, все три corrected UX-06 outputs и исходный audit выше.

Итоговый вердикт — **PASS**. Коррекция закрыла четыре root causes согласованно и сохранила все ранее проходившие
security, role, patient, handoff, branding и provenance boundaries. PASS означает, что UX-06 является достаточным
decision-safe входом UX-07. Он не утверждает открытые OM/BD gates и не означает готовность backend/route migration.

### 7.2 Независимые структурные инварианты

| Проверка | Фактический результат |
|---|---|
| Current `page.tsx` | `150 actual = 150 references = 150 unique`; duplicate `0`, missing `0`, stale `0` |
| Allocation families | `20 platform/public + 81 staff/platform + 49 patient = 150` |
| Canonical registry | `57 rows = 57 unique IDs` в `TARGET_IA.md` |
| Screen compositions | `57 rows = 57 unique canonical IDs` |
| Registry ↔ composition | missing `0`, extra `0` |
| Route-map target references | unknown canonical IDs `0`; каждый используемый ID существует в registry |
| Alias classification | `MGMT-SETUP`, `MGMT-TEAM`, `MGMT-INVITE`, `CLIN-PAT-INVITE`, `ACC-FIRST`, `PAT-INSTALL`, `OPS-05`, `ORG-PUB-04` классифицированы |
| Journey families | ACQ, STF, PIN, SMS, PBK, MOR и ERR сопоставлены как UX-04 states, не parallel screen IDs |
| Markdown structure | code fences balanced; tables structurally present; `git diff --check` PASS |

### 7.3 Закрытие F1–F4

| Finding | Результат re-audit |
|---|---|
| F1 — screen-ID registry | PASS: `TARGET_IA.md` задаёт единственные 57 canonical IDs; ACC-family включена; OPS-05 и flow aliases сведены в shared/state destinations; PUB-06 имеет gated composition, unavailable projection — state ORG-PUB-01/02/03 |
| F2 — multi-state migration | PASS: exact file accounting сохранён, а отдельная trace покрывает `/app?view=registration → PUB-03`, auth/role entry, patient-card tabs, schedule/communications/analytics query tabs, mixed settings/content/booking, redirects и deep-link resolvers |
| F3 — public responsive navigation | PASS: platform public и published organization получили desktop/mobile hierarchy, CTA priority, profile→booking/join transitions, legal/support и one-way canonical recovery без изменения trust/token rules |
| F4 — UX-07 handoff | PASS: все шесть UX-04 priority flows переданы canonical compositions; SMS-01…03 остаётся transport-only branch, PBK-01…08 доходит до exact appointment/enrollment/portal state before install; recovery branches обязательны |

### 7.4 Полный acceptance trace

| Проверка | Результат |
|---|---|
| Все human actors и system-actor boundary | PASS |
| Platform admin отдельно от clinical shell | PASS |
| Owner/admin с binding и без него; management ↔ clinical | PASS как safe candidate, OM-1 не выдан за ruling |
| Solo и clinic: одна organization model, разные композиции | PASS |
| Assistant bounded operations и direct/list/count/search/export parity | PASS; OM-2 остаётся gate |
| Staff one-org и patient multi-org | PASS |
| Patient chooser/deep link/cache/context recovery | PASS; OM-3 остаётся gate |
| One-card candidate без заморозки альтернативы | PASS; OM-4/5 остаются gate |
| Permission-before-filter и private-entry boundary | PASS |
| Primary assignment / care team / work item / cross-org transfer | PASS; generic transfer отсутствует, OM-6/7 сохранены |
| Acquisition, signup, staff/patient invite, install/push | PASS |
| Public booking и SMS fallback | PASS |
| Branding, Host/domain, sender, manifest/PWA и degraded fallback | PASS |
| Loading/empty/permission/entitlement/context/suspended/error states | PASS |
| Desktop/mobile platform public, organization public, staff/assistant/admin и patient navigation | PASS |
| Current reuse, redirects, no duplicate solo/clinic/per-specialist IA | PASS |
| Implementation dependency order и data/API gaps | PASS |
| Current fact / recommendation / safe default / owner ruling provenance | PASS |

### 7.5 Residual gates, not audit failures

- OM-1…8 и BD-1…6 остаются ровно теми owner decision requests, которые явно перечислены в upstream contracts.
- Shared clinical-history classes, assistant grants, handoff launch mechanics, entitlement packaging, directory и
  full white-label scope не стали approved policy из-за наличия safe prototype composition.
- Current `organization_principal_required` Patient Today defect и перечисленные UX-04/05 backend/data gaps не
  исправлены документацией; они остаются implementation inputs UX-09.
- Candidate routes не являются authorization source и не обещают немедленный rename/deploy.

### 7.6 Validation

```text
Exact page-file reconciliation: PASS, 150/150, no duplicate/missing/stale.
Canonical registry/composition equality: PASS, 57/57, no missing/extra/duplicate.
Route-map target-ID subset: PASS, unknown=0.
Multi-state trace markers: PASS.
UX-04 → UX-06 → UX-07 ACQ/STF/PIN/SMS/PBK/MOR trace: PASS.
Markdown fence/table structural checks: PASS.
git diff --check: PASS.
```

Application tests, lint, typecheck, build и DB smoke не запускались: re-audit и status sync меняют только discovery
documentation, не application/schema/runtime behavior.
