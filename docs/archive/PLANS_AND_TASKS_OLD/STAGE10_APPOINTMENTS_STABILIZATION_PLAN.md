# Stage 10: Стабилизация appointments domain — план для авто-агента

> **Режим:** только план. Реализацию выполняет младший агент в режиме авто по этому документу.
>
> **Источник:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), этап 10.

---

## Цель этапа 10

После переноса product appointments view в webapp (Stage 9):

- выполнить reconciliation между provider storage (integrator) и product projection (webapp);
- проверить отмены, обновления, дубликаты и переигровку событий (идемпотентность и устойчивость к out-of-order);
- убрать старые product read paths в integrator (fallback на БД);
- подтвердить, что product appointment model устойчива к новым provider events.

**Результат:** appointments domain живёт в новой архитектуре без опоры на legacy product reads; все product reads идут только через webapp (appointmentsReadsPort).

---

## Meta-инструкция для агента

1. **Одна задача = один логический блок с финальной верификацией.** Следующий блок только после green CI предыдущего.
2. **Каждый шаг — атомарное изменение одного файла.** Путь к файлу, что искать, на что заменить, что проверить.
3. **Тесты — отдельный шаг после production-кода.** Не смешивать.
4. **В конце каждой задачи:** шаг верификации — `pnpm run ci` зелёный.
5. **Не редактировать документы-планы** (этот файл, `DB_ZONES_RESTRUCTURE.md` и др.) — read-only.
6. **НЕ ДЕЛАТЬ:** не менять контракты API webapp (query params, response shape) для `/api/integrator/appointments/*`; не удалять таблицы/миграции; не трогать writePort/booking.upsert и projection outbox; не менять di.ts логику создания appointmentsReadsPort (оставить опциональным при наличии APP_BASE_URL и webhook secret); не удалять функции `getRecordByExternalId` и `getActiveRecordsByPhone` из `repos/bookingRecords.ts` в рамках этапа 10.

---

## Контекст кодовой базы

- **Stage 9 уже сделал:** projection `appointment.record.upserted` из integrator в webapp; таблица `appointment_records` в webapp; backfill и reconcile скрипты; readPort с fallback: при наличии `appointmentsReadsPort` — вызов webapp, иначе чтение из БД integrator (`getRecordByExternalId`, `getActiveRecordsByPhone`).
- **Stage 10:** убрать этот fallback — для `booking.byExternalId` и `booking.activeByUser` использовать только `appointmentsReadsPort`; при его отсутствии — явная ошибка (no silent fallback).
- **Reconciliation:** `apps/webapp/scripts/reconcile-appointments-domain.mjs` сравнивает `rubitime_records` (integrator) с `appointment_records` (webapp). Gate: `pnpm run stage9-gate` (projection-health + reconcile).
- **Guardrails (DB_ZONES_RESTRUCTURE.md):** Webapp event handlers должны быть устойчивы к out-of-order; idempotency key детерминированный; reconciliation обязательна.

---

## Затронутые файлы

| Файл | Задачи |
|------|--------|
| `apps/integrator/src/infra/db/readPort.ts` | T1 |
| `apps/integrator/src/infra/db/readPort.test.ts` | T2 |
| `apps/webapp/src/modules/integrator/events.test.ts` | T3 |
| (запуск gate/reconcile, без изменений кода) | T4, T5 |

---

## Execution order

- **T1** → **T2** → **T3** → **T4** → **T5** (строго по порядку).

---

## T1 (P0): Убрать legacy product reads для appointments в readPort

**Цель:** для запросов `booking.byExternalId` и `booking.activeByUser` не читать из БД integrator; использовать только `appointmentsReadsPort`. При отсутствии порта — явная ошибка.

**Текущее состояние:** В `readPort.ts` для этих двух типов: если `appointmentsReadsPort` задан — вызов порта; иначе вызов `getRecordByExternalId` / `getActiveRecordsByPhone` (чтение из БД integrator). Нужно убрать ветку fallback.

**Решение:** В ветках `booking.byExternalId` и `booking.activeByUser`: вызывать только `appointmentsReadsPort`. Если `appointmentsReadsPort` отсутствует — выбросить ошибку (`new Error('appointments product reads require appointmentsReadsPort')`).

### Шаг T1.1: readPort — убрать fallback для booking.byExternalId

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:**
```ts
        case 'booking.byExternalId': {
          const recordId = asNonEmptyString(query.params.externalRecordId ?? query.params.recordId);
          if (!recordId) return null as T;
          if (appointmentsReadsPort) {
            return (await appointmentsReadsPort.getRecordByExternalId(recordId)) as T;
          }
          return (await getRecordByExternalId(db, recordId)) as T;
        }
```

**Заменить на:**
```ts
        case 'booking.byExternalId': {
          const recordId = asNonEmptyString(query.params.externalRecordId ?? query.params.recordId);
          if (!recordId) return null as T;
          if (!appointmentsReadsPort) {
            throw new Error('appointments product reads require appointmentsReadsPort');
          }
          return (await appointmentsReadsPort.getRecordByExternalId(recordId)) as T;
        }
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** типчек проходит; логика больше не вызывает `getRecordByExternalId(db, …)` для этого case.

---

### Шаг T1.2: readPort — убрать fallback для booking.activeByUser

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:**
```ts
        case 'booking.activeByUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (appointmentsReadsPort) {
            return (await appointmentsReadsPort.getActiveRecordsByPhone(userId)) as T;
          }
          return (await getActiveRecordsByPhone(db, userId)) as T;
        }
```

**Заменить на:**
```ts
        case 'booking.activeByUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (!appointmentsReadsPort) {
            throw new Error('appointments product reads require appointmentsReadsPort');
          }
          return (await appointmentsReadsPort.getActiveRecordsByPhone(userId)) as T;
        }
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** типчек проходит; логика больше не вызывает `getActiveRecordsByPhone(db, …)` для этого case.

---

### Шаг T1.3: Удалить неиспользуемые импорты из readPort

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти (в блоке импортов из repos/bookingRecords.js):**
```ts
import { getActiveRecordsByPhone, getRecordByExternalId } from './repos/bookingRecords.js';
```

**Заменить на:** удалить эту строку целиком (импорт больше не используется в readPort).

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm --dir apps/integrator test` — без ошибок.

**Критерий успеха:** импорты соответствуют использованию; тесты проходят (часть тестов упадёт до T2, т.к. тесты fallback ожидают вызов db.query — после T2 тесты будут обновлены).

---

### Шаг T1.4: Верификация задачи T1

**Команда:** `pnpm --dir apps/integrator test -- readPort.test.ts`

**Ожидание:** тесты `booking.byExternalId falls back to DB` и `booking.activeByUser falls back to DB` упадут (они вызывают readDb без appointmentsReadsPort и ожидают db.query). Это ожидаемо; следующий шаг T2 их заменит.

**Критерий успеха:** типчек и остальные тесты integrator проходят; падают только два указанных теста (которые в T2 будут удалены и заменены на тесты с throw).

---

## T2 (P0): Обновить тесты readPort — убрать fallback-кейсы, добавить кейсы на ошибку при отсутствии порта

**Цель:** тесты должны соответствовать новой логике: при отсутствии `appointmentsReadsPort` — throw, а не fallback на БД.

### Шаг T2.1: Удалить fallback-тесты для appointments

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Найти и удалить целиком два теста:**

1. Блок:
```ts
    it('booking.byExternalId falls back to DB when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await port.readDb({
        type: 'booking.byExternalId',
        params: { externalRecordId: 'rec-1' },
      });

      expect(db.query).toHaveBeenCalled();
    });
```

2. Блок:
```ts
    it('booking.activeByUser falls back to DB when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await port.readDb({
        type: 'booking.activeByUser',
        params: { userId: '+79991234567' },
      });

      expect(db.query).toHaveBeenCalled();
    });
```

**Верификация:** после удаления сохранить файл; тесты для других case не трогать.

**Критерий успеха:** два указанных теста удалены.

---

### Шаг T2.2: Добавить тест: booking.byExternalId throws when appointmentsReadsPort is undefined

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Место вставки:** внутри `describe('appointments reads delegation')`, после теста `booking.byExternalId delegates to appointmentsReadsPort when available` и перед тестом `booking.activeByUser delegates to ...`.

**Добавить:**
```ts
    it('booking.byExternalId throws when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'booking.byExternalId',
          params: { externalRecordId: 'rec-1' },
        })
      ).rejects.toThrow(/appointmentsReadsPort|appointments product reads/);
    });
```

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test.ts` — новый тест зелёный.

**Критерий успеха:** тест добавлен и проходит.

---

### Шаг T2.3: Добавить тест: booking.activeByUser throws when appointmentsReadsPort is undefined

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Место вставки:** внутри `describe('appointments reads delegation')`, после теста `booking.activeByUser delegates to appointmentsReadsPort when available`.

**Добавить:**
```ts
    it('booking.activeByUser throws when appointmentsReadsPort is undefined', async () => {
      const db = createMockDb();
      const port = createDbReadPort({ db });

      await expect(
        port.readDb({
          type: 'booking.activeByUser',
          params: { userId: '+79991234567' },
        })
      ).rejects.toThrow(/appointmentsReadsPort|appointments product reads/);
    });
```

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test.ts` — все тесты в describe appointments зелёные.

**Критерий успеха:** тест добавлен и проходит; все четыре теста в блоке appointments reads delegation зелёные.

---

### Шаг T2.4: Верификация задачи T2

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный. DoD T2: fallback-тесты удалены; добавлены тесты на throw при отсутствии appointmentsReadsPort; CI зелёный.

---

## T3 (P0): Усилить тесты обработки appointment.record.upserted (идемпотентность и аргументы)

**Цель:** подтвердить, что product appointment model устойчива к дубликатам и переигровке событий; явно проверить вызов projection с корректными аргументами при повторной доставке.

**Текущее состояние:** В `events.test.ts` есть тесты "accepts appointment.record.upserted", "rejects ... without required fields", "calls upsertRecordFromProjection with payload when appointment.record.upserted". Нет теста на идемпотентность (два одинаковых события подряд — оба accepted, upsert вызывается дважды с одними данными; итоговое состояние одно и то же).

**Решение:** Добавить тест: отправить два одинаковых события `appointment.record.upserted` с одним и тем же payload; оба вызова должны вернуть `accepted: true`; `upsertRecordFromProjection` должен быть вызван ровно два раза с одинаковыми аргументами (идемпотентность на стороне БД — ON CONFLICT DO UPDATE — уже в pgAppointmentProjection; тест фиксирует, что handler не отбрасывает дубликат и что повторный вызов не ломается).

### Шаг T3.1: Добавить тест idempotent: duplicate appointment.record.upserted both accepted and upsert called twice

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

**Место вставки:** после теста "calls upsertRecordFromProjection with payload when appointment.record.upserted" (тот, где используется upsertSpy), внутри той же группы appointment.record.upserted.

**Действие:** Добавить один тест:

- Создать мок `appointmentProjection` с методом `upsertRecordFromProjection: vi.fn().mockResolvedValue(undefined)`.
- Передать его в deps (аналогично `depsWithAp`, но с этим моком).
- Вызвать `handleIntegratorEvent` дважды с одним и тем же событием `appointment.record.upserted` и одинаковым payload (integratorRecordId, phoneNormalized, recordAt, status, payloadJson, lastEvent, updatedAt).
- Утвердить: оба вызова вернули `accepted: true`.
- Утвердить: `upsertRecordFromProjection` вызван ровно 2 раза с одинаковыми аргументами (toHaveBeenCalledTimes(2) и оба вызова с одним и тем же объектом по полям).

**Верификация:** `pnpm --dir apps/webapp test -- apps/webapp/src/modules/integrator/events.test.ts` — все тесты зелёные.

**Критерий успеха:** новый тест добавлен и проходит; существующие тесты appointment.record.upserted не сломаны.

---

### Шаг T3.2: Верификация задачи T3

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный. DoD T3: идемпотентность обработки `appointment.record.upserted` покрыта тестом.

---

## T4 (P1): Запуск тестов webapp API для appointments и проверка покрытия

**Цель:** убедиться, что все маршруты webapp для appointments покрыты тестами и зелёные.

**Решение:** Не менять код. Выполнить запуск существующих тестов.

### Шаг T4.1: Запуск тестов webapp API для appointments

**Команды по очереди:**

- `pnpm --dir apps/webapp test -- apps/webapp/src/app/api/integrator/appointments/record/route.test.ts`
- `pnpm --dir apps/webapp test -- apps/webapp/src/app/api/integrator/appointments/active-by-user/route.test.ts`

**Верификация:** оба набора тестов проходят.

**Критерий успеха:** подтверждение, что webapp маршруты GET record и GET active-by-user покрыты тестами и зелёные.

---

### Шаг T4.2: Верификация задачи T4

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный. DoD T4: тесты API appointments зелёные.

---

## T5 (P1): Reconciliation и gate — e2e-проверка готовности

**Цель:** убедиться, что reconciliation выполняется успешно и что gate (projection health + reconcile) проходит в среде с БД. Это считается e2e-проверкой готовности appointments domain.

**Решение:** Не менять код. Добавить в план явные шаги проверки и критерии. Агент выполняет только запуск скриптов.

### Шаг T5.1: Запуск reconciliation для appointments (когда доступны БД)

**Команда (требуются DATABASE_URL и INTEGRATOR_DATABASE_URL):**

- `pnpm --dir apps/webapp run reconcile-appointments-domain`
- При необходимости с порогом: `node apps/webapp/scripts/reconcile-appointments-domain.mjs --max-mismatch-percent=0`

**Верификация:** в среде с двумя БД скрипт завершается с кодом 0; при отсутствии переменных окружения шаг можно пропустить с пометкой "skipped (no DB URLs)".

**Критерий успеха:** reconciliation завершается exit 0 или шаг пропущен из-за отсутствия БД.

---

### Шаг T5.2: Запуск stage9-gate (e2e-проверка)

**Команда:**

- `pnpm run stage9-gate`

**Верификация:** в среде с настроенными DATABASE_URL и INTEGRATOR_DATABASE_URL gate завершается с кодом 0 (projection-health + reconcile-appointments-domain). При отсутствии окружения шаг можно пропустить с пометкой "skipped (no DB URLs)".

**Критерий успеха:** gate прошёл (exit 0) или шаг пропущен из-за отсутствия БД; в отчёте агента зафиксировать результат.

---

### Шаг T5.3: Финальная верификация этапа 10

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный.

**DoD этапа 10:**

- Legacy product reads для appointments в readPort убраны (только appointmentsReadsPort; при отсутствии — throw).
- Импорт getRecordByExternalId/getActiveRecordsByPhone удалён из readPort (функции в bookingRecords.ts не удалять).
- Тесты readPort обновлены (fallback удалён, добавлена проверка на throw при отсутствии порта).
- Обработка appointment.record.upserted покрыта тестом на идемпотентность (два одинаковых события — оба accepted, upsert вызван дважды).
- Тесты webapp API для appointments (record, active-by-user) зелёные.
- Рекомендовано выполнить reconcile-appointments-domain и stage9-gate в среде с БД; при выполнении — exit 0.
- Appointments domain считается стабилизированным: product reads только через webapp, без fallback на БД integrator.

---

## Ссылки на guardrails (DB_ZONES_RESTRUCTURE.md)

- Reconciliation обязательна как часть cutover — этап 10 включает запуск reconcile и stage9-gate (T5).
- Webapp event handlers устойчивы к out-of-order/дубликатам — тест идемпотентности в T3.
- Product reads переведены на webapp; в integrator остаются только write (booking.upsert) и projection outbox, чтение продуктовых данных — только через appointmentsReadsPort.

---

## НЕ ДЕЛАТЬ (жёсткие ограничения)

- Не редактировать планы и roadmap документы.
- Не менять контракт API webapp (query params, JSON response) для `/api/integrator/appointments/*`.
- Не удалять и не менять миграции, таблицы integrator или webapp.
- Не трогать writePort.booking.upsert, projection outbox, projection worker.
- Не менять `apps/integrator/src/app/di.ts`: не делать appointmentsReadsPort обязательным при старте (оставить создание только при наличии APP_BASE_URL и webhook secret).
- Не удалять функции `getRecordByExternalId` и `getActiveRecordsByPhone` из `repos/bookingRecords.ts` в рамках этапа 10 (возможен последующий cleanup в Stage 13).
- Не добавлять новые e2e-фреймворки (Playwright и т.п.) без явного требования; e2e-проверкой считать запуск stage9-gate и reconcile в среде с БД.
