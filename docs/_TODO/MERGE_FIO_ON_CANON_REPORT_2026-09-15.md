# Отчёт: Э3 «это ваш аккаунт?» поверх приземлённых Э1 и Э4a

**План этапа:** [`MERGE_MECHANISM_REWRITE_2026-09-14.md`](MERGE_MECHANISM_REWRITE_2026-09-14.md), пункт Э3.
**Правила:** [`AUTH_AND_IDENTITY_CANON.md`](../ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md) §18, §18а, §18б.

**Что сделано.** Ветка `wt/merge-fio-dialog` (`e68de899d`, Э3) влита в `wt/merge-fio-on-canon`, заведённую
от головы `feat` (`8e5c1b40e`), где уже стоят Э1 (гейт слияния по организации) и Э4a (дверь врача).
Коммиты: `bb27f91c9` — само слияние, `96a1e7aa3` — живая проба гейта Э1 приведена к новому входу движка,
плюс коммит с этим отчётом и доказательствами.

Столкнулись 5 файлов: 20 конфликтов в `packages/platform-merge/src/pgPlatformUserMerge.ts`, по два в
`pgChannelLinkClaim.ts` и `pgEmailPasswordLookup.ts`, один в `packages/platform-merge/src/index.ts` и
удаление против правки в `accountMergeMedicalHistory.unit.test.ts`.

---

## 1. Гейт автоматического слияния — победила версия Э1, побуквенно

Тринадцать конфликтов из двадцати — это один и тот же спор: чем считать медицинскую запись. Э3 нёс
старую форму (`automaticProbe?: (id) => SELECT 1 …`, необязательную, проба на один id, ответ
`target_has/duplicate_has`), Э1 — типизированную (`BlockingMedicalHistoryRecord` с ОБЯЗАТЕЛЬНОЙ пробой и
`NonBlockingMergeRecord` с запрещённой, проба `ANY(${sql.param(ids)}::uuid[])`, ответ — список
конфликтующих организаций). Взята версия Э1 целиком: условие соединения, где NULL совпадает с ЛЮБОЙ
организацией, параметр `approvedOrganizationId`, `prepareTransfer`, вынос записей на приём, переписки,
самочувствия и разминок в transfer-only список. Версия Э3 выброшена целиком — она просто старше
владельческого решения Р1, а не спорит с ним.

## 2. Дверь врача Э4a — сохранена без потерь

`MergePlatformUsersOutcome` и поле `mergeOutcome` в возвращаемом значении (все три перегрузки теперь
возвращают его), вызов `app.transfer_staff_approved_platform_user_merge_data`, ранний выход с
`awaiting_other_organization`/`conflict_not_found`, обходы `if (!medicalConflictApproval)` вокруг
`assertAutoMergePasswordCredentialsSafe`, `reconcileOpenTestAttemptsForMerge` и переноса зависимых строк,
`repointPlatformUserContactsForMerge` в ветке `else`. Один из конфликтов (#14) был ложным: Э3 нёс тот же
блок переноса, который Э1/Э4a завернули в условие, — взята завёрнутая версия, дубль удалён.

## 3. Работа Э3 — сохранена без потерь

Размеченное объединение опций с обязательным `humanDecision` для автоматического пути, решатель ФИО
(`resolveHumanFioField`, `resolveManualFioParts`, `formatResolvedDisplayName`), обязательное `patronymic` в
`ManualMergeResolution` и в zod-схеме `POST /api/admin/account-merge/apply`, сверка ответа человека с
заново прочитанными под замком строками, замены `ANY(ARRAY[${a}::uuid, ${b}::uuid])` (конфликты #16, #17,
#19 — фикс `42846` из круга Д-4; форма Э1 `sql.param([a,b])` там же делала то же самое, взята форма Э3 как
названная работа этапа). В `index.ts` экспортируются обе стороны, а не одна.

Исключение — конфликт #18 (`native_push_targets`): там Э3 нёс базовую версию, а `feat` добавил
`OR t.token_hash = d.token_hash`; взят `feat`, потому что Э3 этот участок не трогал вовсе.

## 4. Единственное решение, которого не было ни на одной стороне: третий вариант опций

Э3 сделал `humanDecision` обязательным для автоматического пути, а Э4a зовёт движок БЕЗ него: у двери
врача ответа человека нет. Сложить две работы механически невозможно — либо не собирается дверь врача,
либо обязательность ответа человека перестаёт быть обязательностью.

Разведено по канону: у опций появился третий вариант `StaffApprovedMergePlatformUsersOptions`
(`medicalConflictApproval` обязателен, `humanDecision` и `resolution` не выражаются) и своя перегрузка.
За этой дверью ФИО **не переписывается вовсе**: §18б оставляет врачу ровно два действия — «слить» и
«отказать», — и выбора чужой подписи среди них нет, а §18а запрещает движку выбирать ФИО самому, в том
числе молча. Подпись целевой учётки остаётся как есть. Ослабления Э3 при этом нет: `humanDecision`
по-прежнему невыразимо пропустить на автоматическом пути — вариант без него не собирается, а рантайм-гейт
снят ровно для варианта с одобрением врача.

## 5. Удалённый тест

`apps/webapp/src/infra/accountMergeMedicalHistory.unit.test.ts` удалён вслед за `feat`. Это mock-тест,
сверявший текст SQL; Э1 снёс его сознательно в пользу живой пробы, ветка Э3 дописывала в него ещё один
такой же сценарий. §10a: тест не дублирует код, сверка текста `.sql` — прямой антипаттерн из «Как НЕ надо».
Не воскрешён.

---

## 6. Судьба `recordPatientMedicalMergeConflict` — по каждому месту

Вопрос: после Э3 слияние с двери ушло за диалог, а запись конфликта для врача не должна была пропасть.
Проверено каждое место, где `feat` зовёт `recordPatientMedicalMergeConflict`. Мест оказалось **шесть**, а не
пять: в брифе не назван `pgUserProjection.ts`.

| Место | Слияние после Э3 | Запись конфликта |
|---|---|---|
| `pgUserByPhone.ts:769` | **есть** — `mergePlatformUsersInTransaction(..., 'phone_bind', { humanDecision })`, два вызова (`:617`, `:740`), оба внутри `bindInTransaction` | **живая**, в `catch` вокруг `bindInTransaction` |
| `pgEmailAuth.ts:347` | **есть** — `mergePlatformUsersInTransaction(..., 'email_bind', { humanDecision })` в той же функции | **живая**, в `catch` вокруг транзакции |
| `pgChannelLinkClaim.ts` | **ушло**: `tryMergeChannelLinkOwners` возвращает `human_account_confirmation_required` и НЕ гасит одноразовый токен | запись удалена вместе с телом слияния (версия Э3). Переехала в `pgUserByPhone`/`pgEmailAuth`: человек доводит привязку через диалог в браузере, слияние происходит там, и конфликт заводится там же |
| `pgEmailPasswordLookup.ts` | **ушло**: `tryAutoMergeDuplicateEmailUsers` больше не сливает, пишет `recordEmailAuthConflict(reason: 'human_account_confirmation_required')` | то же: запись удалена вместе с телом слияния, живёт в `pgEmailAuth` — там, где почта подтверждается и слияние происходит |
| `app-layer/integrator/messengerPhoneHttpBindExecute.ts:121` | **ушло**: `applyMessengerPhonePublicBind` → `mergePairIfDistinct` бросает `human_account_confirmation_required` вместо слияния | **ветка оставлена на месте, но недостижима**: `MergeDependentConflictError` за этой дверью больше не возникает. Слияние и запись переехали в `pgUserByPhone` — это дословно записано в шапке самого файла («A collision is continued through the browser auth flow») и в ответе двери: `continuationPath: '/app'` |
| `pgUserProjection.ts:82` | **ушло**: `collapseIdentityProjectionCandidates` при двух кандидатах бросает `MergeConflictError('… human account confirmation required')` вместо каскада слияний | **ветка оставлена на месте, но недостижима** по той же причине; запись живёт там, где слияние теперь происходит |

Итог: **ни одна запись конфликта не потеряна**. На двух путях, где слияние сохранилось, запись стоит в
`catch` вокруг самого слияния; на четырёх, где слияние ушло за диалог, оно приходит в `pgUserByPhone` или
`pgEmailAuth`, и врач получает свой конфликт оттуда. Две недостижимые ветки (`messengerPhoneHttpBindExecute`,
`pgUserProjection`) я **не удалял**: они типизированы корректно, вреда не несут, а вырезание чужой обработки
ошибок — это правка сверх разведения слияния. Вынесено ниже как находка.

---

## 7. Чем доказано

### 7.1 Живая проба двери врача (Э4a) — `# pass 4 # fail 0`

```
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 3 - роль врача не может выписать себе основание для двери
ok 4 - врач чужой организации не проходит дверь конфликта соседней клиники
# tests 4
# pass 4
# fail 0
```

Полный вывод: `docs/audit/evidence/merge-fio-on-canon-2026-09-15/doctor-medical-merge-door.out`.

### 7.2 Живая проба гейта Э1 — `proof_status=PASS scenarios=21 residual_rows=0`

```
# PASS same-organization clinical_visit blocks automatic merge
# PASS same-organization clinical_complaint blocks automatic merge
# PASS same-organization clinical_diagnosis blocks automatic merge
# PASS same-organization clinical_anamnesis_trauma blocks automatic merge
# PASS same-organization clinical_anamnesis_illness blocks automatic merge
# PASS same-organization clinical_anamnesis_lifestyle blocks automatic merge
# PASS same-organization doctor_notes blocks automatic merge
# PASS same-organization symptom_trackings blocks automatic merge
# PASS same-organization patient_lfk_assignments blocks automatic merge
# PASS same-organization treatment_program_instances blocks automatic merge
# PASS different-organization doctor notes merge
# PASS two unattributed medical histories block automatic merge
# PASS legacy unattributed history blocks merge against an attributed organization
# PASS manual merge consolidates same-author same-day doctor notes
# PASS cross-organization active programs keep their organization boundary
# PASS canonical cross-organization notes merge with two active phone histories
# PASS manual merge keeps one preferred auth channel across different channels
# PASS manual merge deduplicates the same native push token
# PASS manual merge consolidates colliding open test attempts without losing results
# PASS manual merge reconciles same-organization active doctor programs
# PASS wellbeing diary entries stay visible after singleton tracking dedup
# proof_status=PASS scenarios=21 rollback=complete residual_rows=0
# tests 2
# pass 2
# fail 0
```

Полный вывод: `docs/audit/evidence/merge-fio-on-canon-2026-09-15/platform-user-merge-gate.out`.

**Проба правлена — и вот почему.** Э3 сделал ответ человека обязательным входом автоматического слияния, а
проба звала движок с `options = undefined` и падала `TypeError` на всех 21 сценариях. Теперь она собирает
ответ из строк, уже лежащих в базе (`createHumanMergePrompt` → ответ по каждому полю, о котором диалог
спрашивает), то есть зовёт движок ровно так же, как двери продукта; в ручной резолюции добавлено
обязательное `patronymic`. Оракул пробы — какие пары блокируются и какие сливаются — не тронут.

### 7.3 Живые доказательства Э3 — зелёные против ЭТОГО клона

```
PASS 1a surname and patronymic complement silently
PASS 1b entirely empty side does not erase structured FIO
PASS 1c display choice preserves each separately confirmed part
PASS 2a empty recognized display falls back to the named side
PASS 2b mirrored empty recognized display also falls back
PASS 2c both empty stay empty without borrowing any other identity
PASS 2d conflicting display-only names write the chosen account name
PASS 3a a real structured conflict refuses an unanswered merge
PASS 3b a missing field alone creates no question
RESIDUE {"platform_users":0,"user_identity":0}

PASS M1 conflicting patronymics take the card the person chose
PASS M2 the mirrored choice writes the other patronymic
PASS M3 the only patronymic survives a card choice that has none
RESIDUE {"platform_users":0,"user_identity":0}
```

⚠️ **Первый прогон этих сценариев был ложно зелёным, и это важно знать ведущему.** Оба скрипта Э3 жёстко
зашивают абсолютный путь `/home/dev/dev-projects/bcb-wt-fio-dialog` и импортируют движок ОТТУДА, поэтому
из любого другого клона они проверяют чужое дерево и зеленеют независимо от него. Пересняты копиями с
переписанным путём: `e3-live-fio-scenarios.rerun.mts`, `e3-live-manual-fio.rerun.mts` в папке доказательств.
Исходные артефакты Э3 не переписывал — завершённое доказательство не правят.

### 7.4 Типы и линтер

```
=== apps/webapp tsc --noEmit ===       EXIT=0
=== apps/integrator tsc --noEmit ===   EXIT=0
=== packages/platform-merge tsc --noEmit === EXIT=0
=== eslint (затронутые файлы webapp) === EXIT=0
```

(`packages/**` в `eslint.config.mjs` исключён из области линтера намеренно — гейт пакета это его `tsc`.)

### 7.5 Затронутые тесты

`node_modules/.bin/vitest run` по шву слияния — 10 файлов, 40 тестов, все зелёные:
`pgEmailPasswordLookup.test.ts`, `d15b6PhoneMessengerBindMirror.unit.test.ts`,
`accountMergeNotification.unit.test.ts`, `phoneMessengerBindTokenProofs.unit.test.ts`,
`platformUserMergePreviewMeaningfulData.unit.test.ts`, `mergeConflictOutcome.route.test.ts`,
`pgUserByPhone.createOrBind.unit.test.ts`, `pgUserByPhone.findByPhone.unit.test.ts`,
`pgUserByPhone.createOrBind.messengerChannel.unit.test.ts` (webapp) и
`messengerPhonePublicBind0380.unit.test.ts` (integrator).

### 7.6 Инъекции — обе стороны сохранили зубы

1. **Граница организации снята** (условие соединения гейта → `ON true`): проба Э1 краснеет ровно там, где
   канон §18 разрешает слияние, — `FAIL different-organization doctor notes merge` и
   `FAIL canonical cross-organization notes merge with two active phone histories`.
   `docs/audit/evidence/merge-fio-on-canon-2026-09-15/injection-gate-organization-boundary.out`.
2. **Движок снова выбирает ФИО сам** (неотвеченное поле молча берётся со стороны цели): сценарии Э3 краснеют
   на `3a a real structured conflict refuses an unanswered merge` — `Missing expected rejection, expected:
   /human choice required for last_name/`.
   `docs/audit/evidence/merge-fio-on-canon-2026-09-15/injection-engine-picks-fio.out`.

Обе инъекции сняты, дерево чистое.

---

## 8. Находки — ведущему/владельцу, НЕ сделано и не заводилось в работу

1. **Ответ человека про ФИО теряется, если слияние отложено до врача.** Человек подтверждает «это мой
   аккаунт» и закрывает вопрос по ФИО; гейт §18 бросает медицинский блокер РАНЬШЕ записи ФИО, транзакция
   откатывается вместе с ответом. Когда врач позже нажимает «слить», ответа человека уже нигде нет —
   в `patient_merge_candidates` он не сохраняется (`app.record_patient_medical_merge_conflict` его не
   принимает). Сегодня это значит: за дверью врача ФИО не меняется, выживает подпись целевой учётки.
   Сохранить ответ и доиграть его при одобрении врача — это новая колонка/параметр функции БД и права,
   то есть новая строка скоупа. В плане такой строки нет, поэтому это вопрос, а не работа.
2. **Две недостижимые ветки записи конфликта** — `messengerPhoneHttpBindExecute.ts:121` и
   `pgUserProjection.ts:82` (раздел 6). Вреда не несут, но описывают путь, которого больше нет.
3. **Живые скрипты Э3 зашивают абсолютный путь клона** (раздел 7.3) — из любого другого дерева они зеленеют,
   ничего не проверив. Если такие сценарии остаются рабочей проверкой, а не замороженным доказательством,
   путь стоит считать от самого файла (§10a, «привязываться к обстоятельствам запуска»).
4. **У поведения ФИО за дверью врача нет оракула.** Проба двери проверяет права, перенос и исход, но не
   то, какая подпись осталась. Новый тест не заводил (§10a, брифом запрещено) — называю как факт.
5. `medicalConflictApprovedForOrganizationId` не имеет ни одного вызывающего в `feat`: поле опций есть,
   гейт его читает, передать его некому. Оставлено как есть — это состояние Э1, не результат слияния.
6. Артефакт `live-manual-patronymic-conflict.mts` (воспроизведение дефекта Д-4) падает по построению: он
   ждёт ДОфиксовую ошибку `42846`, а получает корректный пост-фиксовый отказ
   `merge: invalid custom human choice for patronymic`. Это замороженное доказательство прошлого круга, его
   зелёности никто не обещал; преемник — `live-manual-fio.mts`, он зелёный.

**НЕ СДЕЛАНО:** полный CI (`pnpm run ci`) не запускался — брифом прямо запрещён, его гоняет ведущий после
приземления. Живой прогон интерфейса (диалог «это ваш аккаунт?» в браузере) не делался: задача — разведение
слияния, экраны Э3 принимались на своей ветке.

---

## 9. Строка вердикта — ведущему занести в очередь в главном дереве

> `wt/merge-fio-on-canon` — диалог «это ваш аккаунт?» (Э3) сведён с гейтом по организации (Э1) и дверью
> врача (Э4a): гейт взят из Э1 побуквенно, дверь врача сохранена целиком, движковый выбор ФИО не вернулся
> ни явно, ни молча; у двери врача появился свой вариант опций, за которым ФИО не переписывается.
> Проверено вживую: дверь врача `# pass 4 # fail 0`, гейт `proof_status=PASS scenarios=21 residual_rows=0`,
> сценарии ФИО Э3 9/9 и 3/3 против этого клона, обе инъекции краснеют; `tsc` по трём пакетам EXIT=0,
> `eslint` EXIT=0, 40 затронутых тестов зелёные.
