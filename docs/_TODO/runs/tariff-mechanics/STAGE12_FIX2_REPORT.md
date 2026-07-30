Исправлено и закоммичено: `47e5313c1` (без push).

Что было неправильно: назначенный тариф с `quotas: {}` включал `files`, и POST создавал метаданные без лимита.

Инвариант: у `объём` и будущего `запас` отсутствие конфигурации не означает unlimited. Для назначенного тарифа рост запрещён; compatibility-путь без тарифа сохранён. Новое число не придумано: использован явный статус «лимит не настроен». Настроенный числовой лимит проверяется атомарно под org advisory lock.

Ключевые изменения:

- [resolver](apps/webapp/src/modules/org-entitlements/service.ts:102): explicit quota для `объём`/`запас`, compatibility без изменений.
- [POST файлов](apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts:141): видимый `403` без лимита или при исчерпании.
- [Pg write-port]([redacted-token].ts:94): recount байтов + lock + insert в одной транзакции.
- [тесты](apps/webapp/src/modules/org-entitlements/service.test.ts:184), [лимит](apps/webapp/src/modules/patient-files/service.test.ts:22), [route](apps/webapp/src/app/api/tariffMechanics.route.test.ts:154).

Проверки: 12 targeted tests passed; `pnpm --filter webapp typecheck` и `lint` passed. `0275` не менялась.

Удалил fail-closed ветку вручную: `service.test.ts` упал на ожидании `files=false`, получил `true`; ветка восстановлена и тесты снова зелёные.

Открыто: DEV runtime probe и full CI остаются за lead; не запускались по заданному scope.