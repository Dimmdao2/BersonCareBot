VERDICT: FAIL

Fail-open на backend устранён, но два обязательных пользовательских свойства не выполнены: отказ скрывается UI, а удалить файл и освободить лимит невозможно.

| Проверка | Статус | Evidence | Чувствительность тестов |
|---|---|---|---|
| Настроенный лимит: разрешено до границы, дальше отказ | PASS | Лимит передаётся в write-port: [route.ts:141](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/files/route.ts:141>). Проверка `used + added > limit`: [service.ts:10](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/patient-files/service.ts:10). Boundary-тест: [service.test.ts:22](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/patient-files/service.test.ts:22). | Ловит удаление арифметической проверки и замену `>` на `>=`. Не ловит удаление PG lock/recount или непередачу лимита из route в production port. |
| Назначенный тариф без файлового лимита | FAIL по видимости | Resolver возвращает `files=false`/`undefined`: [service.ts:128](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:128), [service.ts:162](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:162). API отвечает 403: [route.ts:148](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/files/route.ts:148>). Но UI после ошибки безусловно закрывает панель: [PatientTabFiles.tsx:249](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:249>), [PatientTabFiles.tsx:301](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/tabs/PatientTabFiles.tsx:301>). | Resolver и HTTP-отказ ловятся. Route-тест не рендерит UI и невидимый отказ не заметит. |
| Compatibility path без тарифа | PASS | Возвращаются `files=true` и `storageLimit=null`: [service.ts:131](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:131), [service.ts:164](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:164). | Тест заметит блокировку resolver-а, но не является live-clinic/runtime probe. |
| Чтение и скачивание существующих файлов | PASS | List/detail GET не вызывают entitlement guard; detail выдаёт presigned URL: [file route.ts:26](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/files/[fileId]/route.ts:26>). | Затронутые три тест-файла это не защищают. Подтверждено чтением handlers. |
| Удаление и освобождение объёма | FAIL | В patient-file route реализованы только GET/PATCH, DELETE отсутствует: [file route.ts:1](</home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/files/[fileId]/route.ts:1>). Удаление связанного `media_files` лишь обнуляет `media_file_id`, оставляя quota-counted `patient_files`: [patientFiles.ts:73](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:73). | Ни один targeted test не заметит отсутствие удаления. |
| Нет выдуманного ceiling | PASS | Отсутствие конфигурации представлено `undefined`; compatibility/explicit unlimited — `null`: [service.ts:124](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:124). Нового числа не добавлено. |
| Будущий класс `запас` наследует fail-closed shape | PASS структурно | Общая проверка применяется к `объём` и `запас`: [service.ts:120](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:120). | Текущий typecheck защищает декларативную форму; stage 4 всё равно должен будет доказать собственный write-port/race. |
| Файловая атомарность | PASS по коду | Одна transaction: [pgPatientFiles.ts:94](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:94). Порядок: lock → SUM → refusal → media/patient inserts, строки 101–150. Пересчёта вне lock нет. | Удаление lock либо вынос recount наружу текущие Vitest не заметят. File-byte race-script отсутствует. |
| Seats не изменены этим round | PASS | `47e5313c1^..47e5313c1` не меняет `pgOrganizationInvites.ts`. Сохранился порядок transaction → lock → recount → refusal → insert: [pgOrganizationInvites.ts:109](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:109). | Seat script падает на прежнем extractor defect, не доказывая гонку runtime. |
| Reads не gated, mutations gated | PASS, кроме обязательного DELETE | Общий read adapter немедленно разрешает чтение: [requireEntitlement.ts:23](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:23). POST/PATCH файлов gated. |
| Scope diff | PASS | Сам `47e5313c1` меняет 9 файлов; cumulative stage diff от canonical merge point `ce21b8c6f` — 21 файл. Все входят в расширенный §1 scope, включая явно проверяемый file write-port. |

## MUST FIX

1. Отказ загрузки невидим пользователю.

   Достижимый сценарий: врач загружает файл при отсутствующем лимите или сверх настроенного лимита. API возвращает 403, `uploadSingleFile` устанавливает error state, после чего `handleFileChange` и drag-and-drop обработчик безусловно вызывают `onClose()`. Панель размонтируется вместе с сообщением.

   Impact: пользователь видит только отсутствие нового файла, но не причину и не способ исправления. Нарушены Part 1.2 и канон §5.6: отказ всегда должен быть видимым. Текущий route-тест проверяет лишь HTTP JSON и эту поломку не ловит.

2. Нельзя удалить файл и освободить квоту.

   Достижимый сценарий: клиника заполнила конечный файловый лимит и должна удалить старый файл. Patient-files API/port/UI не имеют DELETE. Удаление связанной записи медиатеки оставляет `patient_files` из-за `ON DELETE SET NULL`; эта строка продолжает входить в `SUM(size_bytes)`.

   Impact: клиника остаётся заблокированной на лимите и не может освободить место штатным действием. Нарушены Part 1.4 и канон §5.4: существующие файлы должны всегда удаляться, автоматического удержания данных быть не должно.

## Что теперь верно

- Исходный fail-open дефект backend действительно умер: назначенный тариф без `quotas.files` больше не означает unlimited.
- Compatibility path без тарифа остаётся разрешённым.
- Конечный лимит проверяется внутри той же транзакции после advisory lock и пересчёта.
- Никакой новый продуктовый ceiling не придуман.
- Fail-closed ветка обобщена на будущий класс `запас`.
- Seats этим round не изменены.
- Typecheck, lint и все 12 targeted tests зелёные.

## Что осталось непроверенным и почему

- Реальная гонка двух файловых загрузок: file-byte race-script отсутствует, поэтому атомарная гарантия подтверждена только чтением кода.
- Seat race runtime: существующий script снова упал на буквальной SQL-интерполяции с PostgreSQL `42601`. Его SHA-256 совпадает с версией `a678edc7e`, поэтому это прежний дефект.
- Live DEV/UI/S3 и реальная БД не запускались. Видимость отказа установлена детерминированно по React control flow.
- Ручное удаление guards/locks не выполнялось из-за запрета менять дерево.
- Full CI не запускался по прямому запрету.
- Тесты запускались на `HEAD=aa95fb638`, но `git diff 47e5313c1..HEAD -- apps/webapp/src apps/webapp/db` пуст: проверяемое code tree идентично commit `47e5313c1`.

## Команды и результаты

```text
pnpm --filter webapp typecheck
PASS — exit 0, tsc --noEmit
```

```text
pnpm --filter webapp lint
PASS — exit 0; ESLint + legacy migrations check + check-drizzle-journal-sync: OK
```

```text
pnpm --dir apps/webapp exec vitest run src/modules/org-entitlements/service.test.ts src/modules/patient-files/service.test.ts src/app/api/tariffMechanics.route.test.ts
PASS — 3 test files passed, 12 tests passed, duration 691 ms
```

```text
pnpm --filter webapp check:c4a-843-clinic-invite-concurrency
FAIL — PostgreSQL 42601, syntax error at or near "$"; прежняя буквальная ${CLINIC_SEAT_USAGE_SQL}
```

```text
rg --files apps/webapp/scripts docs/_TODO/SAAS_FOUNDATION/scripts | rg -i '(quota|race|patient.*file|file.*byte|seat)'
```

Результат: найдены только course/CMS quota race scripts; file-byte script отсутствует.

```text
git diff --exit-code 47e5313c1^ 47e5313c1 -- [redacted-token].ts
```

Результат: exit 0, seats-файл commit не менял.

## Чистота clone

Подтвердить clean tree нельзя. Оно было грязным уже при первом `git status`, до тестов: 10 tracked env-example путей заменены средой на character devices `/dev/null`. Я их не трогал, поскольку mission запрещает менять project files. Тесты новых untracked-файлов не оставили (`git ls-files --others --exclude-standard` пуст).