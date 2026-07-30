Исправления 1–5 закоммичены: `718576165` (`#1069`). Не пушил и не мержил.

- Fix 1: `никогда` теперь всегда включён, даже при stored `false` тарифе/override; конструктор также не сохраняет такие ключи. [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:116), [CommercialConstructorClient.tsx](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:81). Тест вызывает реальный mutation guard для `patient_card` со stored false и получает allow. При удалении forcing тест стал получать `403`.

- Fix 2: boolean map управляет только классом `возможность`; seats/files не выключаются скрытым `false`. Seat chokepoint в invite-репозитории приведён к той же модели. Инвариант: числовые значения задают лимит, boolean map не является их рубильником. [service.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.ts:62), [pgOrganizationInvites.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:138). Тест создаёт тариф через constructor service с 3 местами и 1024 bytes, проверяет file mutation guard, seats и projections. При снятом class forcing `clinic_team` стал `false`, тест покраснел.

- Fix 3: добавлен тип класса `запас`; period остаётся compile-time запрещённым. [types.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/types.ts:27). Typecheck-тест содержит корректную scratch declaration и `@ts-expect-error` на period. При удалении union member `typecheck` упал: `'запас' is not assignable`.

- Fix 4: feedback POST теперь также проверяет `material_ratings_enabled`. [feedback route](/home/dev/dev-projects/bcb-wt-[redacted-token]-ratings/feedback/route.ts:40). Один handler-тест покрывает основной PUT и feedback POST; при удалении любого check соответствующий handler вернул `200` вместо `403`.

- Fix 5: добавлены handler-тесты course POST, notification-template PUT и обоих rating writes. [tariffMechanics.route.test.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:69). Удаление course/template guards дало `200` вместо `403`; ratings — аналогично.

Проверки зелёные:

- `pnpm --filter webapp typecheck`
- targeted Vitest: 8/8
- `pnpm --filter webapp lint`

Не закрыто: живой DEV probe назначения тарифа/загрузки файла не запускался — в clone блокирует migration-path guard; это должен выполнить lead в canonical tree.