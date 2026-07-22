# Track A — UI-5a reality audit

Дата: 2026-07-23

Аудитор: `/root/ui5a_reality_audit`

Проверенный HEAD: `dbb1c03ce8c09ba524bb044a508c9d2ccd6e604a`

Owner-plan: `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md`, только UI-5a

Это единственный независимый audit pass для UI-5a. UI-5b, исправления продукта, БД, runtime, deploy и taskdb не входят в этот проход.

## Source binding

- На TEST развёрнут точный product SHA `45ffed731`; evidence зафиксирован в `TEST_DEPLOY_EVIDENCE_2026-07-22.md`.
- Между `45ffed731` и проверенным HEAD нет product diff в маршрутах списка/карточки, workspace shell, state helper и относящихся к UI-5a тестах. Поэтому TEST smoke можно переиспользовать только как доказательство доступности обоих маршрутов, но не как доказательство живого поведения браузерной навигации.
- TEST smoke подтверждает HTTP 200 для списка клиентов и полной карточки. Source-bound PNG полной карточки и живой проход `список → карточка → К клиентам → reload/back/forward` отсутствуют.
- Боковой bounded preview списка — отдельный UI-4 primitive, а не второй full-card tree. Его известная framed-стилизация относится к correction batch UI-4 и не меняет вывод UI-5a.

## Evidence matrix

Статусы: `real-done` — строка полностью доказана кодом, тестом и требуемым live evidence; `partial` — реализация/автотесты есть, но обязательная приёмочная грань не доказана; `fake-done` — закрытие без соответствующей реализации; `owner-deferred` — явное решение владельца отложить строку.

| Owner checkbox | Verdict | Code / test evidence | Live evidence / gap |
|---|---|---|---|
| `[x] Открытие полной карточки заменяет весь doctor content workspace; sidebar остаётся.` | `partial` | `patients/[userId]/page.tsx` рендерит standalone `PatientCardClient` внутри `DoctorAppShell`; `DoctorWorkspaceShell.tsx` держит sidebar стабильным sibling маршрутизируемого `{children}`. TEST smoke подтверждает HTTP 200 списка и карточки. | Нет source-bound PNG полной карточки, одновременно показывающего full doctor workspace и сохранённый sidebar. |
| `[x] Карточка не втискивается в right pane и не создаёт второй component tree/iframe.` | `partial` | `PatientsPageClient.tsx` рендерит в right pane только `PatientPreviewPane`; static contract test доказывает отсутствие `PatientCardClient`/iframe в списке и ровно один `PatientCardClient` на standalone route. | Нет живого перехода из selected bounded preview в full-workspace card; существующий UI-4 PNG показывает только list/preview mode. |
| `[x] «К клиентам» восстанавливает search/sort/filters/selected preview/scroll.` | `partial` | `patientListWorkspaceState.ts` сериализует и валидирует `q`, segments, channel, archived, sort/direction, selected и scroll; `PatientsPageClient.test.tsx` проверяет canonical `returnTo`, восстановление search/sort/selected preview/scroll и отбрасывание malformed state. | Нет живой проверки клика «К клиентам» после изменения всех перечисленных состояний. |
| `[x] Direct URL, reload и browser back/forward сохраняют card/list mode.` | `partial` | List/card mode выражен отдельными URL; server pages принимают direct URL, а state helper канонизирует list URL. Targeted tests проверяют direct parse/restore, TEST smoke — прямой GET обоих маршрутов. | Автотест не моделирует reload и browser history; живого прохода reload/back/forward нет. |
| `[x] Переиспользованы exact standalone loader/guards/data/API; доказана guard-equivalence без visibility/schema изменений.` | `partial` | List и card routes используют один `requireDoctorWorkspaceContext`; card route сохраняет существующий organization-scoped identity lookup и standalone data loader. История UI-5a меняет только route/state/UI tests, без schema/API/visibility изменений; static contract фиксирует один guard и один org identity lookup. | Нет source-bound live role/tenant acceptance на карточке. Кодового расхождения guard/data/API не найдено. |

## Closure

`closed 0/5` against `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md#UI-5a`.

Fake-done строк не найдено. Все пять строк остаются `partial`: implementation evidence есть, но Work Order не разрешает объявить их `real-done` без недостающего live acceptance.

## NOT DONE

- Один source-bound desktop acceptance: открыть список с search/sort/filters/selected preview/scroll, перейти в полную карточку, подтвердить full-workspace mode и сохранённый sidebar, нажать «К клиентам» и проверить полное восстановление состояния.
- На том же проходе проверить direct URL, reload и browser back/forward для card/list mode и сохранить PNG/evidence.
- Это недостающее приёмочное evidence, а не найденный correction batch. Цикл повторных presentation-аудитов не запускать.

## Dependency boundary

- Dependency-ready correction batch по UI-5a: отсутствует — кодового дефекта в пределах пяти owner rows не найдено.
- UI-5b целиком остаётся blocked/out of scope; этот audit не подтверждает и не изменяет его composition/data-policy строки.

## Validation

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patients/PatientsPageClient.test.tsx e2e/doctor-clients-scope-redirects.test.ts 'src/app/app/doctor/patients/[userId]/page.serverBoundary.test.ts' --reporter=dot`
- Результат: `3` файла / `22` теста passed. Global setup не смог применить dev migration `0229_operator_incident_alert_claims` из-за PostgreSQL permission denied (`SQLSTATE 42501`) и продолжил в test fallback; сами targeted tests БД не используют.
- Accumulated full CI на source-bound deployed product SHA `45ffed731` — green согласно TEST evidence; для проверенных UI-5a product paths diff до текущего HEAD отсутствует.
