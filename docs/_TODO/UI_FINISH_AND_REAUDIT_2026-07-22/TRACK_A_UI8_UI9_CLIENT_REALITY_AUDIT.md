# Track A — UI-8 / UI-9 / client residual reality audit

Дата: 2026-07-23

Аудитор: `/root/ui5a_reality_audit`

Проверенный HEAD: `7ec8ecedd2d9c7d1a1b367ea4fc42dcbb5b46ed9`

Owner denominator: ровно две строки UI-8, две строки UI-9 и один client residual из
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md`.

Это единственный независимый audit pass для указанных пяти строк. Исправления продукта, БД, runtime, deploy,
taskdb и owner checkboxes в scope не входят.

## Source binding и validation

- На TEST развёрнут точный product SHA `45ffed7318c584cf501d6972e231d197bebce6f6`. На нём зафиксированы green
  accumulated CI, все пять active units, health/nginx, locked product smoke `22/22` и отдельный deny smoke `403` в
  `TEST_DEPLOY_EVIDENCE_2026-07-22.md:41-55`.
- Feature-коммиты warmup `c4305cdd1`, UI-9 `b3ef8fdf7`, mood chart `b4cd5abba` и S4/C5 `739f67a98` являются
  предками развёрнутого SHA. Diff от развёрнутого SHA до проверенного HEAD во всех перечисленных ниже product/test
  paths пуст. Поэтому accumulated CI применим, а TEST smoke доказывает только работоспособность развёрнутого
  продукта в целом, но не заменяет отсутствующий точный UI/behavior сценарий.
- Fresh targeted packet на точном проверенном HEAD:

  ```text
  pnpm --dir apps/webapp exec vitest run \
    src/modules/org-entitlements/service.test.ts \
    scripts/check-s4-entitlement-coverage.test.ts \
    src/modules/reminders/ensureWarmupsReminderOnFirstPwaPush.test.ts \
    src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.test.tsx \
    src/modules/treatment-program/instanceEditorBatch.test.ts \
    src/infra/repos/pgTreatmentProgramIndividualExercise.behavior.test.ts \
    src/infra/repos/pgTreatmentProgramIndividualExercise.contract.test.ts \
    'src/app/api/doctor/treatment-program-instances/[instanceId]/media-presign/route.test.ts' \
    src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx --reporter=dot

  PASS — 9 files / 88 tests
  ```

  Vitest global setup получил существующий `permission denied` на DEV migration
  `0229_operator_incident_alert_claims` (`SQLSTATE 42501`) и продолжил с in-memory/jsdom/static suites. Все 88
  выбранных тестов выполнились и прошли; DB/runtime evidence из них не выводится.

- `LOG.md:3945-3960` фиксирует независимый high-risk UI-9 re-audit `0 P0 / 0 P1 / 0 P2`, но прямо отмечает отсутствие
  live DEV. `LOG.md:4576-4583` фиксирует отдельный mechanical PASS для warmup defaults, также без live-сценария.
- Единственная начатая DEV-попытка client-home screenshot завершилась route-level `404` и исключена из evidence.
  После этого дальнейшие live-действия не запускались: DEV был зарезервирован сериализованной приёмкой UI-4.
- Bounded live follow-up `2026-07-23T00:55:57.818Z` на текущем feature HEAD
  `eb5ebb09570366d6e9f561b9f34c65dd8dddf13f` использовал канонический `/app/patient`, а не несуществующий
  `/app/patient/home`. Роль `dev:client`, desktop `1440x1024` и mobile `390x844`. В обоих viewport блок
  самочувствия видим, заголовок `Как ваше сегодня?` и пять активных controls присутствуют, а `Ваша неделя` и SVG
  `График самочувствия за последние дни` отсутствуют. HTTP `>=400`, console errors, page errors и request failures —
  по нулям. Чтобы проход оставался read-only, harness локально перехватил четыре автоматических analytics POST и
  два organization-context POST; `/api/patient/mood` не вызывался. Визуально проверены четыре PNG.
- External hashed manifest:
  `/home/dev/dev-projects/.lead/runs/patient-mood-live/eb5ebb095-20260723T005449Z/manifest.md`.
  Продукт предоставляет только `POST /api/patient/mood`; канонический обратимый delete/reset path не найден.
  Поэтому первая отметка ради evidence не создавалась и after-first-mark половина остаётся недоказанной live.

Статусы: `real-done` — текущая строка полностью доказана допустимым для неё code/test/live набором; `partial` —
реализация и тесты есть, но обязательная приёмочная грань не доказана; `fake-done` — owner checkbox закрыт без
соответствующей реализации; `owner-deferred` — есть явное решение владельца отложить строку. Owner acceptance всегда
остаётся отдельным owner-only слоем.

## Five-row evidence matrix

| Owner checkbox                                                                                                           | Current code path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Fresh test evidence                                                                                                                                                                                                                                                                                                                                           | Source-bound live evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `[x] UI-8 использует единый S4/C5 organization-only entitlement/commercial contour без второго registry.`                | `modules/org-entitlements/types.ts:7-32` объявляет единственный `MECHANIC_REGISTRY`, а `OrgMechanic` и `MECHANICS` выводятся из него. `service.ts:100-115,145-188` использует тот же список и exact-org resolver. `CommercialConstructorClient.tsx:73-77,518-548,684-699,720-724,772-784` строит tariff и organization override UI из `MECHANICS` и пишет только выбранной организации. `check-s4-entitlement-coverage.ts:13,43-84,116-141,163-180` привязан к этому registry и ловит незарегистрированные mechanic/bypass. Точный repo-wide symbol census не нашёл второго `MECHANIC_REGISTRY`; отдельный patient content-grant сервис не является mechanic registry и не подключён к UI-8. | `org-entitlements/service.test.ts:40-119,141-147` проверяет compatibility defaults, tariff, org override precedence/expiry, отсутствие A→B leak и единый resolver. `check-s4-entitlement-coverage.test.ts:15-104` проверяет полноту registry, duplicate/unregistered и bypass detection. Оба файла вошли в fresh `88/88`.                                     | Structural row: exact current source, negative coverage tests, пустой relevant diff и deployed accumulated gates достаточны; cosmetic PNG не требуется.                                                                                                                                                                                                                                                                                                                         | **real-done** |
| `[x] Для новых назначений разминок default = 12:00 и 15:00 в рабочие дни; существующие назначения не изменяются (#191).` | `modules/reminders/scheduleSlots.ts:21-25` задаёт exact default `12:00`, `15:00`, `weekdays`. `ensureWarmupsReminderOnFirstPwaPush.ts:31-34,41-72` работает только на первой PWA subscription, сначала ищет canonical/legacy existing rule и создаёт default только при отсутствии. `warmup-schedule/route.ts:103-122` при редактировании merge-ит существующее schedule data, без backfill/rewrite.                                                                                                                                                                                                                                                                                         | `ensureWarmupsReminderOnFirstPwaPush.test.ts:35-71` доказывает новый default, `73-89` повторный push skip, `109-135` сохранение существующего правила и отсутствие create. Fresh файл прошёл.                                                                                                                                                                 | TEST/live сценарий, источник-привязанный одновременно к новому назначению и заранее существующему расписанию, отсутствует. Старый mechanical PASS не заменяет runtime behavior acceptance.                                                                                                                                                                                                                                                                                      | **partial**   |
| `[x] UI-9 создаёт personal-scoped exercise из program editor; org-catalog save только явный.`                            | `InstanceAddLibraryItemDialog.tsx:176-221,414-496,600-714,768-807` держит `saveToCatalog=false` по умолчанию, создаёт `individual_exercise` внутри editor и показывает явный checkbox сохранения в каталог. `instanceEditorBatchSchema.ts:113-131` задаёт strict schema с `.default(false)`. `instanceEditorBatchApply.ts:583-614` ведёт в существующий individual path. `pgTreatmentProgramInstance.ts:994-1012,1035-1073` создаёт exact-org/owner exercise с `personal`, если явный flag не выбран, и сохраняет snapshot.                                                                                                                                                                  | `InstanceAddLibraryItemDialog.test.tsx:271-305` доказывает unchecked default и explicit `true`. `instanceEditorBatch.test.ts:562-624,665-704` проверяет personal create/default false/explicit true. `pgTreatmentProgramIndividualExercise.behavior.test.ts:117-173` проверяет personal default и exact-org fail-closed. Все вошли в fresh packet.            | Нет source-bound живого прохода program editor: «Создать новое» с default personal, затем отдельный явный catalog opt-in. Исторический high-risk audit был code/test-only.                                                                                                                                                                                                                                                                                                      | **partial**   |
| `[x] UI-9 media использует exact-org ownership/presign path, назначенное видео immutable.`                               | `media-presign/route.ts:23-86` использует doctor guard, exact instance и patient folder из авторизованного workspace. `_doctorInstanceWorkspace.ts:8-43` fail-closed проверяет exact organization и patient identity. `pgTreatmentProgramInstance.ts:953-992` требует exact media org/patient/folder/ready video, `1024-1046` замораживает media в snapshot, `1077-1135` разрешает только title update. `instanceEditorBatchSchema.ts:37-43` не имеет media mutation path.                                                                                                                                                                                                                   | `media-presign/route.test.ts:68-114` проверяет authorized folder, cross-org `404` без writes и video-only. Behavior test `163-195` проверяет wrong org/patient/folder/status fail-closed. Contract test `18-41` фиксирует exact bindings и отсутствие media update path; batch tests доказывают неизменность snapshot и reject media patch. Все прошли fresh. | Security/immutability row: точные negative tests и code boundary, independent high-risk PASS, пустой relevant diff и deployed gates достаточны; cosmetic PNG не доказывал бы ownership лучше.                                                                                                                                                                                                                                                                                   | **real-done** |
| `[x] Пустой patient mood chart скрыт до первой отметки, controls не удалены.`                                            | `PatientHomeMoodCheckin.tsx:132,145-155,178-224` рендерит week heading/chart только при `moodWeekMarks.length > 0`, а mood controls и stats оставляет вне condition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `PatientHomeMoodCheckin.test.tsx:65-99` проверяет отсутствие heading/chart при пустой истории, сохранение пяти controls и появление chart после первой отметки. Fresh файл прошёл.                                                                                                                                                                            | Source-bound DEV `dev:client` `/app/patient` на `eb5ebb095`: desktop `1440x1024` и mobile `390x844` подтверждают пустое состояние — week heading/chart отсутствуют, пять активных controls и ссылка статистики остаются; diagnostics `0`. Hashed manifest: `/home/dev/dev-projects/.lead/runs/patient-mood-live/eb5ebb095-20260723T005449Z/manifest.md`. Парного live state после первой отметки нет: без канонического reversible cleanup запись ради evidence не создавалась. | **partial**   |

## Closure counts

- UI-8: `closed 1/2` — `real-done 1`, `partial 1`.
- UI-9: `closed 1/2` — `real-done 1`, `partial 1`.
- Client residual: `closed 0/1` — `partial 1`.
- Total: `closed 2/5`; `fake-done 0`; `owner-deferred 0`.

## NOT DONE

- Warmups: один source-bound controlled live сценарий, который показывает создание нового weekday rule `12:00` /
  `15:00` после first PWA push и неизменность заранее существующего rule.
- UI-9 personal/catalog: один source-bound program-editor проход с default personal create и отдельным explicit
  org-catalog opt-in.
- Client mood: empty-state половина теперь source-bound доказана на desktop/mobile; остаётся source-bound live state
  после первой отметки, где chart появляется, а пять controls сохраняются. Без канонического reversible cleanup
  этот проход намеренно не мутировал DEV.
- Это один будущий batched live-evidence pass после освобождения DEV, а не три correction workers. Если проход
  обнаружит реальный дефект, findings следует собрать в один coherent fix batch; серийный audit-fix loop не запускать.
- Owner acceptance остаётся отдельным и owner-only; этот аудит не меняет plan/taskdb checkboxes.

Code defect внутри пяти owner rows не найден, поэтому dependency-ready correction batch отсутствует.
