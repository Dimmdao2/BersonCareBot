# VERDICT: FAIL

Механизм в основном собран правильно, но принимать этап нельзя: миграция не применится на актуальной БД, предупреждение ступени `терпение` не доходит до клиники, а запрещённая owner-развилка 2.6c частично реализована.

## Проверка пунктов

| Пункт | Статус | Результат |
|---|---|---|
| 2.1 | PASS | На системном и механическом уровнях есть `graceDays`, `warningCount`, `readOnlyDays`, `terminalState`. `null`/отсутствующий ключ — настоящее «не настроено», UI начинается пустым. |
| 2.2 | PASS | Приоритет реализован как `mechanicPolicy ?? systemAccessPolicy`; оба пути доказаны тестом. |
| 2.3 | PASS | Состояние вычисляет один `resolveMechanicAccessFromSnapshot()` из tariff/override/commercial snapshot. |
| 2.4 | **FAIL** | `read_only` и `disabled` работают, но `grace` не выполняет требование о видимом датированном предупреждении: resolver создаёт `{until,count}`, а runtime его отбрасывает. |
| 2.5 | PASS | `patient_card` и `patient_app` имеют класс `никогда`; resolver возвращает им `full_access` до чтения tariff/override. Остальные критичные функции не являются `OrgMechanic`. |
| 2.6 | PASS | Независимый поиск не нашёл действующих `14/2`, `80%`, seat baseline `1` или выбранного terminal. `DAY_MS`, диапазон `0…100` и имена состояний — константы автомата, не политика. `7/3/21` остались только точным шаблоном удаления seed. |
| 2.6a | **FAIL deploy** | Удаление defaults и точный cleanup сделаны, но `0276` обращается к уже удалённому зеркалу `integrator.system_settings`. |
| 2.6b | PASS | `patient_count` и `branches` принимают только `items`; возможность/класс `никогда` число получить не могут. |
| 2.6c | **FAIL** | Открытая owner-развилка частично реализована: `payments` и `branding` попали в общий редактор и существующие mutation-gates уже проводят их через ladder. |
| 2.7 | PASS | UI: «Терпение: дней», «Предупреждений», «Только чтение: дней», «Затем»; слова «квота» нет. |
| 3.1a | PASS | Старый unconditional read-return удалён. `grace` и `read_only` читаются; `disabled` и `unconfigured` получают отказ. Семь registry-read путей теперь не декоративны. |
| 3.1b | PASS | Один visibility adapter используется для меню специалиста, пациентского course-блока и прямых URL обеих сторон. |
| Недеструктивность | PASS | В lifecycle/visibility diff нет удаления доменных данных. Выключение только прячет доступ; повторное включение снова читает прежние записи. |
| Миграционный контракт | **FAIL** | Миграция forward-only и временно пронумерована, но фактически непроходима из-за удалённого зеркала. |
| Out of scope | PASS | В диапазоне `c03c52cab..297bd0bfb` не изменены `SAAS_BILLING_PLAN.md`, mock-payment routes, план и канон. `0259` затронута только для прямо требуемого удаления seed. |

## MUST FIX

1. **Миграция падает на актуальной схеме.**  
   [`0276_access_lifecycle_ladder_local.sql:37`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:37) выполняет `UPDATE integrator.system_settings`. Таблица удалена канонической integrator-миграцией и запрещена правилом [system-settings-single-source.mdc](/home/dev/dev-projects/bcb-wt-tariff/.cursor/rules/system-settings-single-source.mdc:8). Корневой `pnpm migrate` сначала применяет integrator, затем webapp, поэтому достижимый результат — `relation "integrator.system_settings" does not exist`, остановка deploy до установки ladder/schema projection.

2. **`Терпение` не показывает предупреждение клинике.**  
   Resolver формирует дату и количество в [`service.ts:235`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:235), но [`requireEntitlement.ts:44`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/app-layer/guards/requireEntitlement.ts:44) сводит результат к `{ok:true}`, а visibility adapter — к boolean. Других runtime-потребителей `resolution.warning` нет. При `graceDays > 0` клиника получает полный доступ, но не требуемое 2.4 датированное предупреждение; `warningCount` поведенчески ничего не делает.

3. **Реализована запрещённая развилка 2.6c.**  
   [`CommercialConstructorClient.tsx:90`](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:90) разрешает policy всем механикам, кроме класса `никогда`, включая `payments` и `branding`. Существующие пути оплаты и бренд-шаблонов уже вызывают ladder: [`payments/route.ts:85`](/home/dev/dev-projects/bcb-wt-[redacted-token]/[userId]/payments/route.ts:85), [`notification-templates/route.ts:62`](/home/dev/dev-projects/bcb-wt-[redacted-token]-templates/route.ts:62). План требует до ответа владельца не реализовывать ни оплату, ни branding-развилку.

## Что теперь верно

- Все четыре значения действительно задаёт владелец на двух уровнях; числовых или terminal defaults в runtime нет.
- Уровень механики сильнее системного.
- `read_only` разрешает чтение и прямые страницы, но блокирует mutation.
- `disabled` скрывает courses у специалиста и пациента, включая прямой URL.
- Данные при переключении не удаляются.
- Безусловная поблажка всем read-запросам удалена.
- Критичные механики не подчиняются ladder даже при stored `false`.
- Экспорт, 2FA, журнал операций, напоминания/уведомления и emergency не могут быть ключами tariff policy; emergency route отдельно не CMS-гейтится.
- Удаление seed из `public.system_settings` точное: owner-edited значение не затрагивается. Старый `lifecyclePolicy` имел только parser, но не runtime-потребителя, поэтому само удаление не меняет доступ существующих организаций.
- Нового runtime `SECURITY DEFINER` не добавлено: функция patient projection пересоздаётся под прежним именем, итоговый deploy-counter остаётся `110`. Signature и ACL assertions обновлены/сохранены.

## Чувствительность трёх ключевых тестов

| Тест | Что проскочит зелёным |
|---|---|
| `uses mechanic policy before system policy...` | Удаление policy-колонок из SQL/repository projection: тест строит snapshot вручную и БД не касается. |
| `allows reads in read-only... shares visibility...` | Удаление вызова adapter из doctor layout или patient page: тест вызывает adapter напрямую, но не рендерит реальные обе оболочки. |
| `starts unconfigured and exposes owner fields...` | Hardcode/default при submit или потеря сохранения mechanic-level policy: тест только открывает редактор и проверяет подписи, не отправляет форму и не перечитывает тариф. |

## Команды и результаты

- `pnpm --filter webapp typecheck` — exit 0, примерно 7.3 с.
- `pnpm --filter webapp lint` — exit 0, примерно 62 с; `check-drizzle-journal-sync: OK`.
- `vitest run src/modules/org-entitlements/service.test.ts` — **16/16**, 1 файл, 252 мс.
- `vitest run [redacted-token].ui.test.tsx` — **1/1**, 1 файл, 1.29 с.
- `vitest run src/shared/ui/doctor/doctorNavLinks.unit.test.ts` — **3/3**, 1 файл, 205 мс.
- Итого exact Vitest: **3/3 файла, 20/20 тестов**.
- `pnpm --filter webapp check:c4a-843-clinic-invite-concurrency` — exit 0; доказаны 4 аспекта: different-email race, same-email replacement, create-vs-accept последнего места и reservation-until-binding.
- Полный CI не запускался.

Прогоны относятся к текущему интегрированному `HEAD f87f4685b`; реализация двух коммитов отдельно проверялась через снимок `297bd0bfb`.

## Что осталось за лидом на живом DEV

После исправления MUST FIX:

1. Назначить финальный номер миграции и синхронизировать journal.
2. Удалить обращение к `integrator.system_settings`.
3. Запустить из канонического дерева `migrate-dev.sh --preflight`, затем согласованный `--execute`.
4. На живом DEV проверить сохранение/повторное чтение обоих уровней policy.
5. Проверить реальное отображение датированного warning.
6. Переключить courses `on → disabled → on` и подтвердить неизменность данных у специалиста и пациента.
7. Проверить сохранение доступа существующей организации после cleanup `7/3/21`.

## Git-состояние

Точный diff двух коммитов: **23 файла, +1344/−231**. Указанные out-of-scope файлы отсутствуют.

Клон **не чистый**: до аудита и после него остаются 10 изменённых env-примеров; они представлены character-device файлами и дают `unsupported file type` при обычном `git diff`. Аудит файлов не менял, новых изменений после тестов не появилось.