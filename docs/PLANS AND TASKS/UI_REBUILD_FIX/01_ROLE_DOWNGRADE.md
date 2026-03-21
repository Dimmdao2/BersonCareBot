# Fix 01 (CRITICAL): Понижение роли при несовпадении с env

## Проблема

В `exchangeIntegratorToken` и `exchangeTelegramInitData` роль из env применяется только если `envRole !== "client"`. Если integrator-токен заявляет `role: "doctor"`, а env говорит что этот telegramId — обычный client, понижения **не происходит**. Роль из токена сохраняется в сессии и в БД.

## Файлы

- `apps/webapp/src/modules/auth/service.ts`

## Шаги

### Шаг 1.1: Изменить логику в exchangeIntegratorToken

**Файл:** `apps/webapp/src/modules/auth/service.ts`

**Найти (строки ~259–266):**
```ts
  const telegramId = parsed.bindings?.telegramId;
  if (telegramId) {
    const envRole = resolveRoleByTelegramId(telegramId);
    if (envRole !== "client" && user.role !== envRole) {
      if (updateRoleFn) await updateRoleFn(user.userId, envRole);
      user = { ...user, role: envRole };
    }
  }
```

**Заменить на:**
```ts
  const telegramId = parsed.bindings?.telegramId;
  if (telegramId) {
    const envRole = resolveRoleByTelegramId(telegramId);
    if (user.role !== envRole) {
      if (updateRoleFn) await updateRoleFn(user.userId, envRole);
      user = { ...user, role: envRole };
    }
  }
```

Убрали проверку `envRole !== "client"` — теперь если env говорит `client`, а БД/токен говорит `doctor` или `admin`, роль будет **понижена** до `client`.

### Шаг 1.2: Аналогичное изменение в exchangeTelegramInitData

**Найти (строки ~310–314):**
```ts
  const envRole = resolveRoleByTelegramId(parsed.telegramId);
  if (envRole !== "client" && user.role !== envRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, envRole);
    user = { ...user, role: envRole };
  }
```

**Заменить на:**
```ts
  const envRole = resolveRoleByTelegramId(parsed.telegramId);
  if (user.role !== envRole) {
    if (updateRoleFn) await updateRoleFn(user.userId, envRole);
    user = { ...user, role: envRole };
  }
```

### Шаг 1.3: decodeSession — обернуть JSON.parse в try/catch

**Найти (строка ~59):**
```ts
  const parsed = JSON.parse(decodeBase64Url(payload)) as AppSession;
```

**Заменить на:**
```ts
  let parsed: AppSession;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as AppSession;
  } catch {
    return null;
  }
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. Тесты auth если есть — проходят.
3. Логика: токен с `role: "doctor"` + telegramId не в DOCTOR_TELEGRAM_IDS → роль = client.
4. Токен с `role: "client"` + telegramId в ADMIN_TELEGRAM_ID → роль = admin.
