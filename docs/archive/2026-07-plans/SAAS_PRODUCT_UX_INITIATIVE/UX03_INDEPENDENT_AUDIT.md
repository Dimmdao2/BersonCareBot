> ВЕДЁТСЯ В [docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md](../../../_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md) §Общая граница запуска — «Первый выпуск ориентирован на solo specialist и не должен задерживаться из-за clinic-only функций».

# UX-03 — Independent plan-critic audit

**Historical pre-ruling notice (2026-07-16):** этот PASS предшествует
[`OWNER_RULINGS_2026-07-16.md`](../../../_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md). Он сохраняется без переписывания как evidence для
неизменившейся части прежнего scope, но **superseded for current normative acceptance** и не подтверждает
интеграцию новых owner outcomes. Текущий канон ожидает полный re-audit.

**Дата:** 2026-07-15
**Вердикт:** **PASS after fixes**
**Scope:** `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, UX-03 draft/review, `REQUIREMENTS.md`, `ROADMAP.md`
and relevant UX-02 research. No application code, DB, commit or push.

## 1. Канон и метод

Проверены literal owner requirements, поздний addendum про solo/clinic и общую историю, owner rulings по
organization tenant wall/global admin, UX-02 product/technical findings и обязательные acceptance checks из
`UX03_CAPABILITY_ARCH_REVIEW.md`.

Трассировка выполнялась по слоям:

```text
actor/session → membership or enrollment → specialist/object relation → capability
→ entitlement state → server operation → permitted result → presentation filter
```

Также концептуально проверены три Mermaid-блока и выполнен `git diff --check`.

## 2. Найдено и исправлено

### F1 — FAIL до исправления: неполный row-level contract матрицы

Компактная матрица содержала actor, preconditions, capability, filter, entitlement, denial, audit и status, но не
указывала для каждой строки явно target ownership source, server enforcement contract и provenance. Это нарушало
собственный обязательный контракт architecture review §11.1 и позволяло прочитать экранную строку как permission.

**Исправлено:** добавлен нормативный §2.1, который для каждой строки/однородной пары строк фиксирует target,
ownership, enforcement и provenance. Добавлен явный mapping остальных обязательных полей к колонкам основной
таблицы.

### F2 — FAIL до исправления: отсутствовал обещанный список data/API gaps

Draft требовал отдельный список фактических gaps, а synthesis описывал только target contract. Это могло создать
ложное впечатление, что granular history visibility, handoff state machines и support intervention уже существуют.

**Исправлено:** §2.2 отделяет текущие data/API gaps от продуктовых решений и явно перечисляет coarse role flags,
entry-level visibility/parity, handoff primitives, patient context defect, entitlement degradation и global-admin
support workflow.

### F3 — существенная неоднозначность: owner rulings можно было прочитать как противоречие

Owner ruling задаёт organization-wide staff tenant wall и требует `Мои пациенты` как UX-фильтр, а поздний addendum
оставляет на проработку shared-history record classes. Отдельно owner ruling не запрещает global admin доступ к БД,
тогда как product support intervention ещё не определён.

**Исправлено:** оба разграничения записаны прямо. Organization-wide RLS wall не означает, что private/restricted
entry автоматически доступна любой staff role. Отдельная audited support surface не является запретом platform
operational authority и не превращает patient behavior в обычную SaaS-аналитику.

### F4 — FAIL до исправления: status vocabulary и safe defaults были непоследовательны

Часть строк использовала `canonical`, хотя review требует `approved | current_fact | proposal |
needs_owner_decision`; несколько unresolved строк содержали `TBD` или рекомендацию без точного safe behavior.

**Исправлено:** словарь нормализован, unresolved patient-card/history-write/work-item/dual-mode/entitlement rows
получили `needs_owner_decision` и явный deny/read-only/bounded default.

### F5 — gap в handoff edge states

Матрица называла inactive destination, но не определяла восстановление при деактивации source/destination во время
pending handoff.

**Исправлено:** зафиксированы cancel/expire recovery для inactive destination, management recovery queue для
inactive source, обязательный deactivation preflight и неизменность historical authorship.

## 3. Acceptance trace

| Проверка                                                                                 | Результат |
| ---------------------------------------------------------------------------------------- | --------- |
| Все роли: global admin, owner, admin, specialist, assistant, patient, onboarding, public | PASS      |
| Staff one-org и patient multi-org не смешаны                                             | PASS      |
| Owner/admin с specialist binding и без него имеют разные safe surfaces                   | PASS      |
| Solo и clinic — одна account model, разная capability-driven композиция                  | PASS      |
| Одна org-card — только recommended candidate; alternatives не скрыты                     | PASS      |
| `Мои / Вся доступная / specialist X` применяются после authorization                     | PASS      |
| List/direct/count/search/export parity задана                                            | PASS      |
| Private/shared record classes не раскрываются entitlement или UI filter                  | PASS      |
| Primary assignment, care team, work item и cross-org transfer разделены                  | PASS      |
| Pending/accept/reject/cancel/expire/deactivation recovery покрыты                        | PASS      |
| Capability и entitlement имеют разные denial/recovery states                             | PASS      |
| Global-admin analytics и support intervention разделены без запрета DB authority         | PASS      |
| Unresolved rows сопоставлены с owner decision packet и safe defaults                     | PASS      |
| Owner decision packet минимален и приоритизирован по downstream block                    | PASS      |

## 4. Проверка owner decision packet

Packet не просит владельца решать инженерную реализацию authorization/RLS или количество DB roles. Он содержит
только решения, которые меняют product access, composition или launch scope. Объединение card model + shared-history
policy + `Мои` в один P0 допустимо: эти три решения должны быть согласованы одновременно и ведут к одной screen
composition. Handoff launch/acceptance также оставлен одним P0, но четыре primitives внутри не схлопнуты.

Ни один recommended candidate не помечен как owner-approved. До rulings UX-04 может продолжать identity-safe invite
mechanics, UX-05 — branding/domain contract; UX-06 не должен замораживать patient card/history, assistant, handoff,
dual-mode navigation и entitlement recovery.

## 5. Mermaid и repository checks

- `flowchart LR`: узлы и ветви relationship → capability → entitlement → operation → filter синтаксически
  согласованы.
- `stateDiagram-v2`: initial state, enrollment resolution, chooser, organization context и recovery имеют допустимые
  transitions и объявленные identifiers.
- `flowchart TB`: четыре handoff primitives расходятся независимо, attribution/source retention не образуют
  двусмысленного transition.
- Code fence pairs закрыты; unsupported Mermaid constructs не обнаружены.
- `git diff --check`: PASS.

## 6. Итог

После F1–F5 UX-03 выполняет literal scope и проходит независимый plan-critic. **PASS относится к полноте и
непротиворечивости candidate artifacts, а не к принятию открытых product decisions владельцем и не к готовности
implementation.** Следующий управляемый шаг — вынести P0/P1 packet владельцу в момент, когда решение действительно
нужно для UX-04/05/06, не подменяя его safe default.
