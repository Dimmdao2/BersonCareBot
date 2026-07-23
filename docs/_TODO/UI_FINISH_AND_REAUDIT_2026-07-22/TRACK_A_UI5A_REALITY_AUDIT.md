# Track A — UI-5a reality audit

Дата: 2026-07-23

Аудитор: `/root/ui5a_reality_audit`

Проверенный HEAD: `e669e2c123c41ddb1167af8e31e4f2f9f472c98b`

Owner-plan: `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, только UI-5a

Это единственный независимый audit pass для UI-5a. Ниже добавлен один bounded LIVE DEV acceptance batch; это не
повторный product-аудит и не audit/fix-цикл. UI-5b, исправления продукта, БД, deploy и taskdb не входят в этот
проход.

## Source binding

- Canonical TEST deploy `2c3b40e77` имеет тот же UI-5a product tree, что проверенный docs-only HEAD: scoped
  `git diff --name-status 2c3b40e77..e669e2c12 -- <UI-5a product paths>` пуст. На этом product tree полный CI и
  locked smoke `22/22` уже прошли согласно `TEST_DEPLOY_EVIDENCE_2026-07-22.md`.
- Один source-bound LIVE DEV pass выполнен на exact SHA `e669e2c12`, `http://127.0.0.1:5200`, роль `dev:doctor`,
  существующий populated synthetic client. DB не менялась. External manifest:
  [`manifest.md`](/home/dev/dev-projects/.lead/runs/ui5a-live/e669e2c12-20260723T001414Z/manifest.md).
- В проходе нет HTTP `>=400`, console error или page error. Зафиксированы desktop pointer hover/select,
  `list → full card → К клиентам`, reload, browser Back/Forward, direct URL и supporting mobile PNG.
- Боковой bounded preview списка остаётся отдельным UI-4 primitive, а не вторым full-card tree.

## Evidence matrix

Статусы: `real-done` — строка полностью доказана кодом, тестом и требуемым live evidence; `partial` — реализация/автотесты есть, но обязательная приёмочная грань не доказана; `fake-done` — закрытие без соответствующей реализации; `owner-deferred` — явное решение владельца отложить строку.

| Owner checkbox | Verdict | Code / test evidence | Live evidence / gap |
|---|---|---|---|
| `[x] Открытие полной карточки заменяет весь doctor content workspace; sidebar остаётся.` | `real-done` | Standalone route рендерит единственный `PatientCardClient` внутри `DoctorAppShell` (`patients/[userId]/page.tsx:203-244`); shell держит sidebar sibling рабочего `{children}` (`DoctorWorkspaceShell.tsx:92-103`). Targeted UI-5a tests `22/22` и accumulated CI уже green. | `03-full-workspace-card.png`: `#doctor-patient-card-header=1`, sidebar `Клиенты` виден, `#doctor-patients-list=0`. |
| `[x] Карточка не втискивается в right pane и не создаёт второй component tree/iframe.` | `real-done` | List right pane содержит только `PatientPreviewPane` (`PatientsPageClient.tsx:808-810`); full-card href создаётся отдельно (`:621-626`), а preview CTA использует его (`PatientPreviewPane.tsx:400-405`). Static contract доказывает отсутствие `PatientCardClient`/iframe в list tree. | `01-hover-no-preview.png` + trace: hover оставил empty preview и `selectedCount=0`; реальный pointer select дал `02-selected-list-state.png`, затем CTA открыл `03-full-workspace-card.png` с удалённым list tree. |
| `[x] «К клиентам» восстанавливает search/sort/filters/selected preview/scroll.` | `partial` | State helper сериализует/валидирует `q`, segments, channel, archived, sort/direction, selected и scroll (`patientListWorkspaceState.ts:66-101`); list восстанавливает scroll (`PatientsPageClient.tsx:628-632`) и держит URL через `replaceState` (`:937-954`). Targeted tests покрывают в том числе ненулевой scroll. | `05-return-link-restored-list.png` и trace доказывают реальный возврат search=`Автотест`, `on_support`, `fio/asc`, selected row и functional preview. Но bounded fixture имела `scrollMax=0`, поэтому ненулевой live scroll не доказан. |
| `[x] Direct URL, reload и browser back/forward сохраняют card/list mode.` | `real-done` | List/card — отдельные server routes; helper строит canonical deep link и `returnTo` (`patientListWorkspaceState.ts:84-115`). Targeted tests проверяют parse/restore; accumulated TEST smoke даёт HTTP 200 обоих маршрутов. | `04-card-after-reload.png`, `05-return-link-restored-list.png`, `06-history-back-card.png`, `07-history-back-list.png`, `08-direct-url-safe-return.png`: reload и history сохраняют правильный mode/state, direct URL открывает card. |
| `[x] Переиспользованы exact standalone loader/guards/data/API; доказана guard-equivalence без visibility/schema изменений.` | `partial` | Оба server routes используют `requireDoctorWorkspaceContext` (`patients/page.tsx:24-50`; `patients/[userId]/page.tsx:28-46`); card route сохраняет organization-scoped identity lookup и прежние standalone loaders (`patients/[userId]/page.tsx:36-80`). UI-5a product diff не содержит schema/API/visibility изменений. | Positive `dev:doctor` same-tenant direct card passed. Off-origin `returnTo` был канонизирован в `/app/doctor/patients` (`08-direct-url-safe-return.png`), но negative cross-organization denial в этом bounded pass не выполнялся. |

## Closure

`closed 3/5` against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md#UI-5a`.

Fake-done строк не найдено. Строки 1, 2 и 4 получили недостававшее source-bound LIVE evidence. Строки 3 и 5
остаются `partial` по точным fixture/tenant gaps ниже. Owner acceptance не подменяется этим агентским evidence.

## NOT DONE

- Ненулевой live scroll restore: текущий bounded список после search/filter имел `scrollMax=0`; code/test evidence есть,
  но source-bound browser evidence ненулевой позиции отсутствует.
- Negative cross-organization card denial / tenant-isolation live evidence не выполнялся. Positive `dev:doctor`
  same-tenant guard path и safe `returnTo` доказаны.
- Owner PNG/click acceptance остаётся открытым.
- Это evidence residual, а не найденный correction batch. Цикл повторных presentation-аудитов не запускать.

## Dependency boundary

- Dependency-ready correction batch по UI-5a: отсутствует — кодового дефекта в пределах пяти owner rows не найдено.
- UI-5b целиком остаётся blocked/out of scope; этот audit не подтверждает и не изменяет его composition/data-policy строки.

## Validation

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patients/PatientsPageClient.test.tsx e2e/doctor-clients-scope-redirects.test.ts 'src/app/app/doctor/patients/[userId]/page.serverBoundary.test.ts' --reporter=dot`
- Результат: `3` файла / `22` теста passed. Global setup не смог применить dev migration `0229_operator_incident_alert_claims` из-за PostgreSQL permission denied (`SQLSTATE 42501`) и продолжил в test fallback; сами targeted tests БД не используют.
- Accumulated full CI на byte-identical UI-5a product tree `2c3b40e77` — green согласно TEST evidence; scoped
  product diff до `e669e2c12` пуст.
- LIVE DEV: один source-bound browser batch на `e669e2c12`; HTTP `>=400` / console / page errors = `0 / 0 / 0`.
- Docs-only validation для этого continuation: `git diff --check`.
