# Ч1 — независимый blind audit двухстадийной upload-door

## Target и authority

- Роль: `auditor-live`; product fix запрещён.
- Target product commit: `e94b3069d` (`wt/ch1-upload-current`).
- Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч1.
- Oracle: `ready` недостижим без validated received-object result; все шесть intake-путей проходят через
  закрытую именованную policy двухстадийной двери; structural gate с self-test запрещает седьмой обход.
- Ч1б не входит в scope, кроме минимального rollback собственного нового confirm-path.
- Запрещённые среды/операции: DB, server, DEV, TEST, PROD, deploy, push.

## Классификация до проверки

- **Тест:** повторяемое поведение intent/received validation, переход `pending → ready`, отсутствие side effects
  при отказе, UI success/failure, auth denial и structural-gate bypass fixtures.
- **Взгляд/AST:** полнота ровно шести route, отсутствие лишнего scope/новых сущностей, import graph, wiring gate в
  lint/CI и граница с Ч1б. Source-text tests на отсутствие строк не создаются.

## Blind kill-set — зафиксирован до inspection

Ни target diff, ни target tests, ни worker report до фиксации этого раздела не читались. Каждый fault ниже должен
быть либо убит зелёным тестом при временной инъекции, либо представлен постоянным красным acceptance oracle на
исходном target.

| ID  | Временно внесённая поломка / вход                                                                        | Наблюдаемый impact, который обязан увидеть oracle                                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| I1  | Один из шести route обходит intent-door или выбирает неверную именованную policy                         | Unsupported MIME/extension либо over-cap принимается на конкретном публичном route                                |
| I2  | Intent принимает пустое, whitespace-only, path-only или иначе invalid filename                           | До отказа вызывается DB/folder/presign/storage boundary либо клиент получает upload intent                        |
| I3  | Caller передаёт произвольный `{ allowedMime, maxBytes }` или подделывает/кастует policy/validated mark   | Новый route может ослабить policy без изменения закрытой media-door и без падения structural gate/typecheck       |
| I4  | Один route выполняет folder/DB/presign/storage side effect до intent acceptance                          | Невалидный intent оставляет запись, папку, presign или storage-вызов                                              |
| R1  | Confirm считает `declaredSize=1` достаточным при большем `HEAD Content-Length`                           | Over-cap/size-mismatch object становится `ready` и обходит quota/per-file policy                                  |
| R2  | Confirm доверяет declared/header MIME при подменённом stored `Content-Type`                              | Объект чужого типа становится `ready`                                                                             |
| R3  | Confirm пропускает несовместимую magic/signature при допустимых filename/header MIME                     | Повреждённый/замаскированный объект становится `ready`                                                            |
| R4  | Direct-to-S3 validation читает полный object либо небounded prefix                                       | Проверка требует неограниченного чтения вместо `HEAD` + bounded range/prefix; gate/contract не удерживает границу |
| R5  | Generic single-PUT confirm принимает один факт существования объекта                                     | Pending row становится `ready` без validated received-object result                                               |
| R6  | Individual single-PUT confirm принимает один факт существования объекта/header MIME                      | Pending row становится `ready` без size/type/signature validation                                                 |
| R7  | Multipart complete переводит запись в `ready` сразу после S3 complete                                    | Multipart object становится `ready` без общей received-object validation                                          |
| R8  | Patient-submission confirm принимает существование/header MIME                                           | Submission становится `ready` при size/type/signature mismatch                                                    |
| P1  | Patient-files presign создаёт `ready` до PUT/confirm или pending учитывается как ready/quota             | Несуществующий объект видим как готовый и/или расходует quota                                                     |
| P2  | Presign, PUT либо confirm отвечает ошибкой, а UI проходит success branch                                 | Врач видит успешную загрузку/готовый файл после фактического отказа                                               |
| P3  | Успешный patient-files confirm обновляет лишь часть требуемого ready/file state                          | UI/последующее чтение видит неполное либо противоречивое состояние                                                |
| P4  | Повторный confirm не идемпотентно отказывает/возвращает прежний успех                                    | Происходит повторный storage/state side effect либо создаётся второй ready-result                                 |
| P5  | Confirm выполняется для чужого file/org/patient                                                          | Storage/DB state меняется до auth/ownership denial                                                                |
| P6  | Новый patient confirm-path падает после собственного state/storage шага                                  | Не выполняется минимальный rollback нового шага; собственный регресс Ч1 оставляет ложное ready/частичный state    |
| X1  | Proxy принимает empty body                                                                               | Пустой объект записывается либо создаётся media row                                                               |
| X2  | Proxy принимает disallowed MIME/extension или файл больше 50 MiB                                         | Нарушены прежние proxy MIME/size semantics; вызываются storage/DB writes                                          |
| X3  | Proxy принимает несовместимую magic/signature                                                            | Замаскированные bytes записываются в storage                                                                      |
| X4  | Proxy пишет bytes до принятого received result                                                           | При received-validation отказе остаётся storage side effect                                                       |
| A1  | Убирается doctor-workspace/org/patient/instance/entitlement/status guard на одном route                  | Чужой/неавторизованный actor доходит до storage/state change                                                      |
| G1  | Добавлен седьмой intake route с прямым upload primitive                                                  | Structural gate остаётся зелёным                                                                                  |
| G2  | Обход импортирован alias- или relative-import формой                                                     | Structural gate остаётся зелёным                                                                                  |
| G3  | Обход спрятан в dynamic import, namespace import или re-export                                           | Structural gate остаётся зелёным                                                                                  |
| G4  | Route использует raw S3 SDK или переименованный helper                                                   | Structural gate остаётся зелёным                                                                                  |
| G5  | Route напрямую вызывает pending/ready repository primitive                                               | Structural gate остаётся зелёным                                                                                  |
| G6  | Route напрямую делает storage write/presign/complete                                                     | Structural gate остаётся зелёным                                                                                  |
| G7  | Законные preview/delete/purge/background либо download paths ошибочно классифицированы как intake bypass | Negative-control fixture падает, делая gate непригодным                                                           |
| G8  | Self-test тривиально выключен/озеленён либо gate удалён из lint/CI graph                                 | Обязательный pipeline остаётся зелёным без реально работающей проверки обходов                                    |

## Fault injection evidence

| Fault                                                            | Killed / missed на `e94b3069d`                                                | Exact command / assertion                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1: любой из шести route выбирает более широкую policy           | **KILLED**                                                                    | Временно `individual-exercise-video → cms`; `pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts -t 'individual exercise rejects'` → red: ожидался `415`, получен `200`. В исходном target route-таблица MIME/policy зелёная для всех шести экспортов. |
| I1: MIME-valid файл с несовместимым extension                    | **MISSED PRODUCT; permanent red oracle**                                      | Полный route-прогон: `payload.exe + image/jpeg` на `/api/media/presign` → target `200`, assertion ожидает `415` и отсутствие pending/presign.                                                                                                                                                                  |
| I2: empty proxy filename                                         | **MISSED PRODUCT; permanent red oracle**                                      | Полный route-прогон: `File(..., '', {type:'image/jpeg'})` → target `200`; assertion ожидает `400` и `media.upload` not called.                                                                                                                                                                                 |
| I3: caller передаёт policy object                                | **KILLED BY TYPE**                                                            | Временный compile-fixture с `policyId: {allowedMime,maxBytes}`; `pnpm --dir apps/webapp typecheck` → `TS2322`, object не assignable к `UploadPolicyId`.                                                                                                                                                        |
| I3: caller кастует `ReceivedUpload`                              | **MISSED CONSTRUCTION/GATE**                                                  | Временный compile-fixture `const forged = {} as ReceivedUpload; acceptReceivedMedia(id, forged)`; `pnpm --dir apps/webapp typecheck` → green. Gate-fixture с тем же обходом тоже green и остаётся permanent red oracle.                                                                                        |
| I4: invalid proxy intent касается folder boundary                | **MISSED PRODUCT; permanent red oracle**                                      | Route-прогон: invalid MIME + реальный UUID `folderId` возвращает `415`, но `media.folderExists(folderId)` уже вызван; `not.toHaveBeenCalled()` red.                                                                                                                                                            |
| R1: отключена сверка `HEAD Content-Length`                       | **KILLED**                                                                    | Временно выключена ветка size mismatch; `pnpm --dir apps/webapp exec vitest run --project=fast src/modules/media/uploadValidation.test.ts` → red `received_size_mismatch`.                                                                                                                                     |
| R2: отключена сверка stored `Content-Type`                       | **KILLED**                                                                    | Та же команда после точечной мутации → red `received_content_type_mismatch`.                                                                                                                                                                                                                                   |
| R3: отключена magic/signature validation                         | **KILLED**                                                                    | Та же команда после точечной мутации → red `file_signature_mismatch`.                                                                                                                                                                                                                                          |
| R4: range удалён из `s3GetObjectPrefix`                          | **KILLED**                                                                    | `pnpm --dir apps/webapp exec vitest run --project=unit src/infra/s3/s3UploadPrefix.unit.test.ts` → red: у `GetObjectCommand.input` нет `Range: bytes=0-511`.                                                                                                                                                   |
| R5/R6: generic/individual confirm игнорирует received rejection  | **KILLED**                                                                    | Временно отключена rejection-ветка generic confirm; route-test `-t 'generic confirm rejects declared one byte'` → red: target fault вернул `200` вместо `413` и вызвал ready boundary. Individual presign отдельно убит policy mutation выше; его second stage — этот generic confirm.                         |
| R7: multipart complete идёт в finalizer после bad signature      | **KILLED**                                                                    | Временно отключена received rejection; route-test `-t 'multipart complete refuses'` → red `200` вместо `415`, finalizer достижим.                                                                                                                                                                              |
| R8: patient-submission confirm идёт в ready после size mismatch  | **KILLED**                                                                    | Временно отключена received rejection; route-test `-t 'patient submission confirm refuses'` → red `200` вместо `413`.                                                                                                                                                                                          |
| P1/P3/P6: pending projection, quota и atomic ready/file rollback | **ROUTE KILLED; PostgreSQL runtime НЕ ПРОВЕРЕНО**                             | Route oracle не вызывает `confirmFileUpload` до received result; итоговый diff показывает один `runDrizzleMutationTransaction` для quota + `media_files.ready` + `patient_files` update. Реальный rollback/конкурентная quota не запускались: DB запрещена brief-ом.                                           |
| P2: UI считает confirm failure успехом                           | **KILLED**                                                                    | Временно выключена UI confirm-error branch; UI-test `-t 'shows confirm failure'` → red: error исчез, panel закрылся. Presign/PUT/confirm failures и success на исходном target: 4/4 green.                                                                                                                     |
| P2/P3: UI не refresh/close после полного success                 | **KILLED**                                                                    | Временно выключены `onUploaded/onClose`; UI-test `-t 'closes and refreshes only'` → red: 3 fetch вместо 4, panel остался открыт.                                                                                                                                                                               |
| P4/P5: repeat либо foreign patient confirm проходит дальше       | **KILLED**                                                                    | Route tests возвращают `409/404` до S3/state. При удалении patient equality-check `-t 'belongs to another patient'` red: `getMediaRowForConfirm` был вызван.                                                                                                                                                   |
| X1: empty proxy form принимается                                 | **KILLED**                                                                    | Временно отключён `files.length===0` guard; route-test `-t 'rejects an empty proxy form'` → red `200` вместо `400`.                                                                                                                                                                                            |
| X2: proxy MIME/50 MiB policy ослаблена                           | **KILLED**                                                                    | Public proxy handler: unsupported MIME → `415`; forged parsed File size `50 MiB + 1` → `413`, `arrayBuffer` и `media.upload` не вызваны.                                                                                                                                                                       |
| X3/X4: proxy пишет bytes при bad signature                       | **KILLED**                                                                    | Временно отключена `validateBufferedMediaUpload` rejection; route-test `-t 'does not write proxy bytes'` → red `200` вместо `415`; `media.upload` был достижим.                                                                                                                                                |
| A1: doctor/patient auth guard снят                               | **KILLED**                                                                    | Точечные мутации doctor proxy и patient submission guard; route-tests `-t 'denies doctor upload intents'` / `-t 'denies patient submission'` → red до state/storage assertions.                                                                                                                                |
| G1/G2/G3/G4/G5/G6/G7/G8 fixtures                                 | **5 bypass classes killed; 8 bypass classes MISSED; negative controls green** | `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/media/mediaUploadDoorGate.unit.test.ts` → 8 permanent red: re-export, renamed helper, direct pending, aliased ready, adapter presign, adapter complete, forged mark, comment marker; 5 promised bypass fixtures + negative control green.   |
| G8: gate включён в lint/CI                                       | **MISSED STRUCTURE**                                                          | `rg -n 'check-media-upload-door' package.json apps/webapp/package.json .github/workflows apps/webapp/eslint.config.mjs` → 0 matches. `apps/webapp` lint вызывает ESLint/raw-SQL/migration checks; root `ci` вызывает этот lint, но не upload-door gate/self-test.                                              |

Все production mutations и compile fixtures после каждого прогона откатаны. Итоговый tracked product tree снова
совпадает с `e94b3069d`; постоянными оставлены только acceptance tests и этот artifact.

## Route/lifecycle matrix

AST/import-graph census дал ровно шесть intent route с реальным вызовом `prepareMediaUpload` или
`validateBufferedMediaUpload`:

| Public intake                                                                               | Policy / stages                                                                                         | Route-level result                                                                                                                 | Lifecycle/auth result                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /api/media/upload`                                                                    | `proxy`; buffered intent + received before `media.upload`                                               | **FAIL:** empty filename accepted; extension not validated; folder boundary вызывается раньше intent. MIME, 50 MiB и magic — PASS. | Doctor guard PASS; no bytes before received PASS. Legacy S3→DB orphan — Ч1б, не finding Ч1.                            |
| `POST /api/media/presign` → `POST /api/media/confirm`                                       | `cms`; pending → HEAD + 512-byte range → ready                                                          | **FAIL:** incompatible extension accepted at presign. Received size/type/magic — PASS.                                             | Doctor/org/owner/status guards PASS; invalid-confirm object cleanup — Ч1б.                                             |
| `POST /api/media/multipart/init` → `part-url` → `complete`                                  | `cms`; pending/session → S3 complete → metadata HEAD + shared received → atomic session/media finalizer | Intent MIME/cap and received signature route acceptance PASS.                                                                      | Doctor/org/session/status PASS; cleanup после invalid received — Ч1б.                                                  |
| `POST /api/doctor/treatment-program-instances/[instanceId]/media-presign` → generic confirm | `individual-exercise-video`; video-only intent, затем shared generic received                           | Route policy mutation и generic confirm mutation killed.                                                                           | Doctor workspace + instance/patient folder guards PASS.                                                                |
| `POST /api/patient/media/program-submission/presign` → `confirm`                            | `patient-program-submission`; image/video, 250 MiB, pending → shared received → ready                   | MIME/cap и received mismatch PASS.                                                                                                 | Patient/business/feature/org/owner/status guards PASS.                                                                 |
| `POST /api/doctor/patients/[userId]/files` → `[fileId]/confirm`                             | `patient-file`; pending metadata → PUT → received → transactional quota + ready/file                    | Route received, repeat, foreign patient and UI success/failure PASS.                                                               | Code view: pending filtered from list/quota and one Drizzle transaction at confirm. PostgreSQL execution НЕ ПРОВЕРЕНО. |

Дополнительный import-graph census показал, что target не добавил седьмой фактический intake route. Изменения
ограничены upload validation, шестью intake/четырьмя confirm surfaces, patient-files lifecycle/UI, S3 bounded read,
gate и worker artifact; миграций/таблиц/колонок/второго upload-service нет. Ч1б cleanup не включён в findings.

## Findings

### F1 — intent-door принимает invalid filename/extension

`validateUploadIntent` проверяет только non-empty/length, MIME и size; совместимость extension с MIME отсутствует.
Кроме того, proxy заменяет пустое `file.name` на `upload`. Достижимые сценарии:

- authenticated doctor отправляет `{filename:'payload.exe', mimeType:'image/jpeg', size:3}` в generic presign и
  получает `200`, pending row и presigned PUT;
- multipart/form-data с `File.name === ''`, валидным JPEG MIME/signature проходит proxy и вызывает storage upload.

Impact: обещанная intent policy обходится до DB/presign/storage; unsupported/invalid файл попадает в медиатеку.
Permanent red assertions: `uploadDoorAcceptance.route.test.ts` — extension ожидает `415`, empty filename `400`.

### F2 — proxy касается folder/DB boundary до intent refusal

`/api/media/upload` строит deps и вызывает `resolveUploadFolderIdFromForm` до цикла `validateFile`. При invalid MIME
и валидном `folderId` target действительно вызвал `media.folderExists(folderId)` (и затем folder assignability),
после чего вернул `415`.

Impact: invalid upload не отказывается до DB/folder boundary, как требует Ч1; error precedence может раскрывать
состояние folder и создаёт DB-нагрузку до принятого intent. Permanent red assertion проверяет отсутствие обоих
folder calls.

### F3 — дверь структурно обходится и validated mark можно скастовать

`ReceivedUpload` экспортируется как TypeScript type; `{} as ReceivedUpload` проходит `typecheck`, adapter принимает
его, а ready repositories получают `_received` и не используют значение. Structural gate этот сценарий не ловит.
Тот же fixture-прогон оставил gate зелёным ещё для raw re-export, renamed wrapper, direct pending primitive,
aliased ready primitive, прямых adapter presign/complete и comment-only `prepareMediaUpload()` marker.

Impact: planted seventh route компилируется, проходит существующий gate и может перевести pending media в `ready`
без validated received-object result — прямое нарушение основного oracle Ч1. Permanent gate test оставляет восемь
красных acceptance oracles.

### F4 — gate и self-test отсутствуют в lint/CI graph

Ни `apps/webapp/package.json` `lint`, ни root `lint`/`ci`, ни workflows не вызывают
`check-media-upload-door.mjs` или `--self-test`. Поэтому даже пять форм, которые standalone gate умеет ронять,
проходят обязательный pipeline.

Impact: seventh bypass может попасть в сборку без механического сигнала; требование «gate с self-test роняет CI»
не выполнено.

Findings вне этих четырёх не заявлены. Отсутствующий cleanup существующих/abandoned/invalid-confirm объектов — Ч1б,
если target не создаёт новый regression; он здесь не превращён в finding.

## Проверки итогового дерева

| Команда                                                                                                                       | Результат                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm --dir apps/webapp exec vitest run --project=fast src/modules/media/uploadValidation.test.ts`                            | PASS, 3/3 worker helper tests                                           |
| `pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts`                 | **FAIL**, 3 permanent red / 20 pass                                     |
| `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/media/mediaUploadDoorGate.unit.test.ts`                    | **FAIL**, 8 permanent red / 6 pass                                      |
| `pnpm --dir apps/webapp exec vitest run --project=ui 'src/app/app/doctor/patients/[userId]/tabs/PatientTabFiles.ui.test.tsx'` | PASS, 4/4                                                               |
| `pnpm --dir apps/webapp exec vitest run --project=unit src/infra/s3/s3UploadPrefix.unit.test.ts`                              | PASS, 1/1                                                               |
| `node apps/webapp/scripts/check-media-upload-door.mjs`                                                                        | PASS standalone, но недостаточный                                       |
| `node apps/webapp/scripts/check-media-upload-door.mjs --self-test`                                                            | PASS standalone, но обещанные fixtures неполны и CI wiring отсутствует  |
| `pnpm --dir apps/webapp typecheck`                                                                                            | PASS на итоговом tree; отдельный forged-mark fixture тоже ошибочно PASS |
| Targeted ESLint по target upload paths + новым tests                                                                          | PASS                                                                    |
| `node scripts/check-test-runner-visibility.mjs`                                                                               | PASS; новые suffixes выбираются `route`/`unit`/`ui` projects            |
| Prettier check новых tests/report                                                                                             | PASS                                                                    |
| `git diff --check e94b3069d^ e94b3069d`                                                                                       | PASS                                                                    |

## Итог

**FAIL.** Ч1 нельзя закрывать и checkbox ставить нельзя: четыре findings выше достижимы; route/gate acceptance
oracles оставлены постоянными красными. Product-код не исправлялся.

## НЕ ПРОВЕРЕНО

- Реальное PostgreSQL выполнение/rollback patient-file transaction, конкурентная quota и фактическая невидимость
  pending rows: DB запрещена brief-ом. Wiring и единая transaction boundary проверены кодом, но это не DB evidence.
- Живой S3/браузер/DEV runtime: server/DEV/TEST/PROD запрещены. Проверены реальные route exports с mocked external
  ports, UI fetch flow и SDK command contract (`HEAD` + `Range: bytes=0-511`).
- Full repository CI не запускался: это app-scope audit, а permanent red acceptance tests уже задают ожидаемый FAIL;
  обязательные user gates `typecheck`, targeted lint, target/new tests, gate/self-test и scoped diff-check выполнены.
