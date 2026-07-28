# UX-07 — Scenario prototype index

**Статус:** historical pre-ruling prototype. The earlier two-reviewer PASS/seals remain source-bound evidence for
`929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`, but are superseded for current normative
acceptance by [`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Current contract awaits re-audit;
the prototype must not be read as launch scope for clinic/assistant/transfer/deep-brand branches.
**Прототип:** [`ux07-prototype/index.html`](./ux07-prototype/index.html).  
**Scope:** self-contained low-fidelity task/recovery prototype; application routes, API, DB and delivery are not
changed.

## 1. Как открыть и проверять

`index.html` можно открыть напрямую или через временный static server на любом свободном порту, кроме `:5200`.
Сценарий, состояние и viewport являются состоянием URL:

```text
#flow=<scenario>&step=<zero-based-state>&viewport=<desktop|mobile>[&result=<represented-outcome>]
```

- Кнопки внутри продукта выполняют подписанное действие и ведут к явному destination либо показывают наблюдаемый
  represented result; одинаковый state/hash больше не считается результатом действия.
- `Предыдущий макет` / `Следующий макет` и карта слева — только reviewer navigation, отдельно от продуктовых CTA.
- Back/forward, прямой hash и внешняя смена hash повторно строят видимое состояние из URL.
- Кнопка `Проверка` раскрывает IDs, contract status, security trace и pending gates. По умолчанию эта диагностика
  закрыта и не смешана с пользовательским текстом.
- Desktop/mobile меняют композицию, но не доверенный контекст, доступность действия или recovery.

Прототип использует только вымышленные организации, маскированные контакты и сокращённые имена. Он не вызывает API,
не отправляет сообщения и не хранит runtime-данные.

## 2. Scenario and canonical trace

| Scenario                                            | State trace                     | Canonical destination trace                          | Labelled recovery / boundary                                                                               |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Specialist landing → signup → owner first-run       | `ACQ-01…05`                     | `PUB-01 → PUB-03 → MGMT-01 / ACC-02 → CLIN-01`       | validation, OTP resend, retry, binding pending, security recovery                                          |
| Historical clinic staff invite                      | `STF-01…08`, `ERR-02/05/06/07`  | Future-reserved MGMT-02/join/account trace           | Pre-ruling evidence only; absent from initial solo release                                                 |
| Patient email invite → install → push               | `PIN-01…09`, `ERR-04/05/07`     | `CLIN-02/03 → ORG-PUB-03 / PUB-04 → PAT-02 → PAT-11` | wrong recipient, replay, installed re-auth, denied/revoked push                                            |
| SMS fallback                                        | `SMS-01…03` over patient invite | `CLIN-03 → ORG-PUB-03 / PUB-04`                      | email proof remains required; SMS never elevates auth                                                      |
| Public booking → patient app                        | `PBK-01…08`                     | `ORG-PUB-01 → ORG-PUB-02 → PUB-04 → PAT-04`          | unavailable publication, no slots, pending review, slot conflict                                           |
| Returning multi-org patient                         | `MOR-01…05`                     | `PUB-04 → PAT-01 → PAT-02`                           | neutral chooser, explicit context change, foreign/revoked target                                           |
| Management ↔ clinical                               | UX-06 validation flow           | `MGMT-01 / ACC-02 ↔ CLIN-01`                         | no mode switch without specialist binding                                                                  |
| Brand and custom domain                             | UX-05 contract states           | `MGMT-04 → MGMT-05 → MGMT-06 → ORG-PUB-02`           | independent binding degradation and one-way platform fallback                                              |
| Historical clinic card/visit-coordination candidate | Superseded pre-ruling flow      | `CLIN-02 → CLIN-03 / CLIN-04 / CLIN-05`              | Not launch scope; current contract uses solo card/manual visit and reserves CLIN-05 for future clinic work |

The inventory remains exactly **9 scenarios / 73 states**. `ORG-PUB-04` is only the UX-06 degraded-state alias for
`ORG-PUB-02`; `ACQ-05` remains a reused first-run state reference, not a parallel screen registry.

## 3. Interaction and composition contract

### Explicit action graph

Every product CTA is a semantic `<button>` or `<a>` with an explicit scenario/state destination or named represented
result. Actor, trusted context, required capability and observable outcome travel with the control. Happy, recovery,
terminal and object-level actions are not inferred from array order. Examples exercised in evidence and validation:

- expired staff invite → request fresh invite or login;
- booking no-slots/slot-conflict → service or slot selection with safe draft preserved;
- terminal patient invite → authentication, never a second relationship mutation;
- verified multi-org deep link → explicit context-change notice before target org;
- degraded custom booking binding → one-way stable platform booking entry;
- denied shared history/handoff → own history/card/patient list without forbidden counts or controls.
- resend/retry/status → visible idempotent result; calendar/preparation/nearest-visit/settings/visit-assignment →
  represented object result instead of inert self-target;
- public Support/Documents and anonymous invite/seat recovery → public-safe result without MGMT/CLIN/PAT shell.

### Product layer versus reviewer diagnostics

Primary headings, body text, statuses and actions use plain Russian task/outcome/recovery language. State IDs,
canonical screen IDs, exact lifecycle terms, OM/BD references and authorization order live only in the optional
reviewer disclosure and the scenario map. Pending gates remain inspectable without appearing as owner-approved
product policy.

### Trusted shell composition

- Staff always keeps `Клиника Север` visible on desktop and mobile; a semantic mobile drawer exposes only modeled,
  available destinations.
- Dual-capability owner sees a management/clinical mode link; owner without specialist binding sees no such link.
- Patient neutral chooser says `Организация не выбрана`, has no organization bottom navigation and does not silently
  preselect a context.
- Authorized patient screens show the active organization and canonical five-item bottom navigation; secondary
  organization/install destinations remain available in the drawer/desktop navigation.
- Active navigation follows the represented canonical destination rather than defaulting to the first item.
- `Все доступные`, specialist-history and cross-org handoff controls are absent before the corresponding capability
  or owner ruling.

### Semantic low-fidelity controls

Forms use labelled input/select controls. Product actions, public links, sidebars, drawers and patient navigation use
button/link/nav semantics with `aria-current`, focus-visible styling and heading/result focus after actions. The
shared mobile drawer keeps its toggle stable, moves focus into navigation (or the drawer when empty), closes on
Escape, returns focus to the toggle and preserves organization/navigation text. The prototype validates a coherent
keyboard path without claiming production screen-reader or final contrast acceptance.

## 4. Decision-safe boundaries preserved

- staff stays one-organization; patient switches only among server-resolved enrollments;
- first value precedes install, and push remains a separate explicit choice;
- email/SMS delivery, identity proof and relationship state remain separate;
- domain/base/binding, sender and PWA readiness remain independent;
- Host/brand/filter/mode never grants access;
- one organization card and named handoff operations remain candidates; OM-4…7 and BD-1…6 are still pending;
- no real PII, live delivery, application runtime, DB or source application code was used.

## 5. Evidence and validation

Current representative batch:

- [`2026-07-15T21-03-18Z/run-manifest.md`](../../../.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T21-03-18Z/run-manifest.md)
- source SHA-256: `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`

The batches `2026-07-15T19-36-23Z` and `2026-07-15T20-16-39Z` are historical/superseded evidence and must not be
used as current acceptance evidence.

Automated convergence gate on the current source:

- `146/146` state/viewport renders;
- `284` labelled action checks: `66` represented results + `218` represented navigations;
- `284` actor/context/capability/outcome contracts and `284` back/forward pairs;
- `146` external hash re-renders and `146` keyboard activation checks;
- `42` authenticated staff/patient mobile drawer checks;
- `124` public Support/Documents boundary checks;
- zero same-state target actions, overflow, assertion, console, runtime or network failures.

This evidence and the two independent source-bound reviews demonstrate phase acceptance. Both reviewers recorded
**PASS** and seals #1/#2 in [`UX07_INDEPENDENT_AUDIT.md`](./UX07_INDEPENDENT_AUDIT.md) §§11–13. Any prototype
source change invalidates these source-bound seals and requires fresh evidence plus a new full two-reviewer audit.
