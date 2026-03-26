# Этап 8 (P1 КРИТИЧНО): Восстановление определения роли администратора/специалиста

**Задачи:** P-22

**Приоритет:** P1 — выполнять ПЕРВЫМ, до всех остальных этапов UI.

## Проблема

После обновления БД (миграция данных, stages 0–13) администратор определяется как обычный пациент. При входе открывается кабинет пациента вместо кабинета специалиста.

## Корневая причина

Цепочка определения роли:

1. **Telegram initData** → `validateTelegramInitData()` → `role = admin` если `user.id === ADMIN_TELEGRAM_ID`, иначе `client`.
2. **НО:** если пользователь уже существует в `platform_users`, `pgIdentityResolution.findOrCreateByChannelBinding()` берёт роль из БД → `SELECT role FROM platform_users WHERE id = $1`.
3. При backfill (stage 3–4, `backfill-person-domain.mjs`) все пользователи вставляются с `role = 'client'` (дефолт таблицы).
4. **Результат:** администратор существует в `platform_users` с `role = 'client'`. При входе через Telegram initData его роль из env (`admin`) игнорируется — берётся из БД (`client`).

Аналогично: doctor роль вообще нигде не назначается в коде. Нет env-переменной для специалистов.

## Решение

### Шаг 8.1: Добавить env-переменную для специалистов

**Файл:** `apps/webapp/src/config/env.ts`

В zod-схеме добавить:

```ts
DOCTOR_TELEGRAM_IDS: z.string().optional().default(""),
```

Рядом с `ALLOWED_TELEGRAM_IDS`.

### Шаг 8.2: Добавить функцию определения целевой роли по Telegram ID

**Файл:** `apps/webapp/src/modules/auth/service.ts`

Добавить функцию:

```ts
function resolveRoleByTelegramId(telegramIdStr: string): UserRole {
  const numericId = parseInt(telegramIdStr, 10);
  if (typeof env.ADMIN_TELEGRAM_ID === "number" && numericId === env.ADMIN_TELEGRAM_ID) {
    return "admin";
  }
  const doctorIds = (env.DOCTOR_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (doctorIds.includes(telegramIdStr) || doctorIds.includes(String(numericId))) {
    return "doctor";
  }
  return "client";
}
```

### Шаг 8.3: Обновлять роль в БД при авторизации через Telegram

**Файл:** `apps/webapp/src/infra/repos/pgIdentityResolution.ts`

В функции `findOrCreateByChannelBinding` — после нахождения существующего пользователя добавить параметр `expectedRole` и обновлять роль если она отличается.

**Альтернативный подход (проще):** В `exchangeTelegramInitData` в `service.ts` — после получения `resolved` от `identityResolutionPort`, проверить если роль из env отличается от роли из БД — обновить через `userProjection.updateRole(userId, envRole)`.

**Файл:** `apps/webapp/src/modules/auth/service.ts`

В `exchangeTelegramInitData`:

**Найти** (примерно):
```ts
const resolved = await identityResolutionPort.findOrCreateByChannelBinding(
  "telegram", result.telegramId, { role: result.role, displayName: result.displayName }
);
```

**После этого добавить:**
```ts
const envRole = resolveRoleByTelegramId(result.telegramId);
if (envRole !== "client" && resolved.role !== envRole) {
  await updateUserRole(resolved.userId, envRole);
  resolved.role = envRole;
}
```

### Шаг 8.4: Добавить метод updateUserRole

**Файл:** `apps/webapp/src/infra/repos/pgUserProjection.ts`

Добавить метод:

```ts
async updateRole(userId: string, role: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE platform_users SET role = $2 WHERE id = $1", [userId, role]);
}
```

Добавить in-memory вариант в `inMemoryUserProjectionPort`.

Пробросить через `buildAppDeps()`:

```ts
userProjection: {
  ...
  updateRole: userProjectionPort.updateRole,
}
```

### Шаг 8.5: Аналогично для token exchange

**Файл:** `apps/webapp/src/modules/auth/service.ts`

В `exchangeIntegratorToken` — после resolve через identityResolutionPort, если `parsed.telegramId`:

```ts
if (parsed.telegramId) {
  const envRole = resolveRoleByTelegramId(parsed.telegramId);
  if (envRole !== "client" && resolved.role !== envRole) {
    await updateUserRole(resolved.userId, envRole);
    resolved.role = envRole;
  }
}
```

### Шаг 8.6: Обновить ALLOWED_TELEGRAM_IDS

Убедиться, что `getAllowedTelegramIds()` включает ID из `DOCTOR_TELEGRAM_IDS`:

```ts
function getAllowedTelegramIds(): Set<string> {
  const raw = env.ALLOWED_TELEGRAM_IDS ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const doctorRaw = env.DOCTOR_TELEGRAM_IDS ?? "";
  const doctorIds = doctorRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (typeof env.ADMIN_TELEGRAM_ID === "number") {
    ids.push(String(env.ADMIN_TELEGRAM_ID));
  }
  return new Set([...ids, ...doctorIds]);
}
```

### Шаг 8.7: Сценарий привязки Telegram после входа через телефон

Текущий flow:
1. Пользователь входит по телефону → `platform_users.role = 'client'`.
2. Позже привязывает Telegram → projection event `contact.linked` → `user_channel_bindings` получает `telegramId`.
3. При следующем входе через Telegram initData → `findOrCreateByChannelBinding` найдёт пользователя по `telegramId` → шаг 8.3 обновит роль если `telegramId` в списке специалистов.

Для **немедленного** обновления роли при привязке (без повторного входа):
- В обработчике projection event `contact.linked` (`src/modules/integrator/events/`) — если добавляемый `telegramId` совпадает с `ADMIN_TELEGRAM_ID` или `DOCTOR_TELEGRAM_IDS` — обновить `platform_users.role`.

Это опционально на первом этапе. Минимум — роль обновляется при следующем входе.

## Быстрый hotfix (если нужно восстановить доступ немедленно)

Выполнить SQL на production БД:

```sql
UPDATE platform_users
SET role = 'admin'
WHERE id = (
  SELECT user_id FROM user_channel_bindings
  WHERE channel_code = 'telegram'
    AND external_id = '<ADMIN_TELEGRAM_ID>'
  LIMIT 1
);
```

Заменить `<ADMIN_TELEGRAM_ID>` на реальный ID администратора из env.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Администратор входит через Telegram initData → открывается кабинет специалиста (`/app/doctor`).
3. Специалист (из `DOCTOR_TELEGRAM_IDS`) входит → открывается кабинет специалиста.
4. Обычный пользователь входит → открывается кабинет пациента (`/app/patient`).
5. Пользователь, вошедший по телефону, привязавший Telegram с ID из специалистов → при следующем входе получает кабинет специалиста.
