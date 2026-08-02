# Независимый аудит тарифного управления предоплатой при записи

Дата: 2026-08-02. Ветка: `wt/booking-prepayment-entitlement` @ `83c744ff1`.
Продукт: `6c2cefa1c`; integration merge актуального `feat`: `83c744ff1`.

Authority: `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §4.6 и owner contract консолидации: `booking_prepayment`
управляет только настройкой и применением предоплаты при записи; правила отмены не меняются.

## Вердикт: **FAIL**

Серверные границы и публичная запись реализованы правильно, но экран настройки не является действительно
read-only: врач может выбрать отключение действующей политики и получает активную кнопку сохранения. Нужен один
ограниченный fixer по сохранённому UI oracle; повторный blind audit не нужен.

## Реальная находка

### F1 — в `read_only` экран предлагает запрещённое изменение политики

- **Путь:** клиника переходит в тарифное состояние `read_only` при уже включённой предоплате → врач открывает
  настройку записи → выбирает режим «Отключена» → кнопка «Сохранить» становится активной.
- **Фактическое поведение:** `BookingPrepaymentSection.tsx` считает `canEnable=false`, но разрешает выбрать
  `disabled`; условие кнопки блокирует только `mode !== 'disabled' && !canEnable`. Поэтому запрещённый тарифом
  PUT выглядит доступным. Серверный `requireEntitlementForMutation` затем отвечает 403, то есть данные защищены,
  но человек получает ложное действие и ошибку вместо режима просмотра.
- **Impact:** режим «только чтение» не соблюдён интерфейсом; врач не может отличить допустимое отключение при
  недоступном провайдере от запрещённого изменения по тарифу.
- **Нарушенное требование:** §4.6 — `read_only` запрещает изменение clinic policy.
- **Красный oracle:** во временном UI-тесте ответ API имел `visible:true`, существующую `fixed_minor` policy и
  `availability:{available:false,reason:'commercial_read_only'}`. После выбора «Отключена» ожидание disabled
  кнопки упало: `Received element is not disabled`. Временный тест после доказательства удалён; продукт не менялся.

Точный fixer: различить тарифный запрет изменения и недоступность провайдера. При
`commercial_read_only`/`commercial_blocked`/`access_lifecycle_unconfigured` все mutation controls должны быть
неактивны; возможность выключить policy при одном лишь `payment_provider_unavailable`/`payments_disabled`
сохраняется.

## Пройденные границы

- `disabled`/`unconfigured`: GET возвращает `visible:false`, не читает сохранённые policies; UI не рендерит
  секцию.
- Любой PUT, включая `mode=disabled`, проходит через `requireEntitlementForMutation` до ownership-check и
  `upsertPrepaymentPolicy`; прямого write-обхода не найдено.
- Публичная запись создаёт обычную confirmed booking без quote/intent, когда `booking_prepayment` выключена.
- Существующая предоплата в `booking_prepayment=read_only` применяется только когда отдельная `payments` имеет
  `full_access`/`grace`; `payments=read_only|disabled` не создаёт новый intent.
- Единственный production-вызов `upsertPrepaymentPolicy` находится в проверенном route; правила отмены и их
  retain/refund пути diff продукта не затрагивает.

## Команды

```text
pnpm --dir apps/webapp exec vitest run --project=route src/app/api/admin/booking-engine/prepayment-policies/route.route.test.ts
→ 1 file / 7 passed

pnpm --dir apps/webapp exec vitest run --project=ui src/app/app/settings/BookingPrepaymentSection.ui.test.tsx
→ 1 file / 4 passed

pnpm --dir apps/webapp exec vitest run --project=fast src/modules/patient-booking/canonicalCreate.d14.test.ts
→ 1 file / 5 passed

pnpm --dir apps/webapp exec vitest run --project=unit src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts
→ 1 file / 8 passed

# временный read-only acceptance oracle
pnpm --dir apps/webapp exec vitest run --project=ui src/app/app/settings/BookingPrepaymentSection.ui.test.tsx
→ 1 failed / 4 passed; Save button was enabled after selecting «Отключена»

rg -n "upsertPrepaymentPolicy\\(" apps/webapp/src --glob '!**/*.test.*'
→ production write path: payments port/service/repository and one route caller
```

DEV/TEST/PROD, миграции, Track D и продуктовый код не затрагивались.
