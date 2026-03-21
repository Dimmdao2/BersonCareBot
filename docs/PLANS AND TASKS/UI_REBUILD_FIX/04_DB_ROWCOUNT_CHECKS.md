# Fix 04 (HIGH): Проверка rowCount в updateRole и updateDisplayName

## Проблема

`updateRole` и `updateDisplayName` в `pgUserProjectionPort` выполняют `UPDATE ... WHERE id = $2` без проверки `result.rowCount`. Если userId не существует — 0 rows updated, без ошибки. Вызывающий код думает что обновление прошло.

## Файлы

- `apps/webapp/src/infra/repos/pgUserProjection.ts`

## Шаги

### Шаг 4.1: updateDisplayName — проверить rowCount

**Файл:** `apps/webapp/src/infra/repos/pgUserProjection.ts`

**Найти:**
```ts
  async updateDisplayName(platformUserId, displayName) {
    const pool = getPool();
    await pool.query(
      "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2",
      [displayName, platformUserId],
    );
  },
```

**Заменить на:**
```ts
  async updateDisplayName(platformUserId, displayName) {
    const pool = getPool();
    const result = await pool.query(
      "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2",
      [displayName, platformUserId],
    );
    if (result.rowCount === 0) {
      throw new Error(`updateDisplayName: user ${platformUserId} not found`);
    }
  },
```

### Шаг 4.2: updateRole — проверить rowCount

**Найти:**
```ts
  async updateRole(platformUserId, role) {
    const pool = getPool();
    await pool.query(
      "UPDATE platform_users SET role = $1, updated_at = now() WHERE id = $2",
      [role, platformUserId],
    );
  },
```

**Заменить на:**
```ts
  async updateRole(platformUserId, role) {
    const pool = getPool();
    const result = await pool.query(
      "UPDATE platform_users SET role = $1, updated_at = now() WHERE id = $2",
      [role, platformUserId],
    );
    if (result.rowCount === 0) {
      throw new Error(`updateRole: user ${platformUserId} not found`);
    }
  },
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. Тесты — при несуществующем userId функции бросают ошибку.
