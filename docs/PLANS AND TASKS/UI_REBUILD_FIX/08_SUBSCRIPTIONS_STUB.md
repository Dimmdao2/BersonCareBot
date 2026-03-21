# Fix 08 (MEDIUM): SubscriptionsList — честно показать что функция в разработке

## Проблема

Чекбоксы всегда `defaultChecked={true}`, server action — no-op. Пользователь думает что настраивает уведомления, но ничего не сохраняется.

## Файлы

- `apps/webapp/src/app/app/patient/notifications/SubscriptionsList.tsx`

## Шаги

### Шаг 8.1: Добавить уведомление "в разработке"

**Файл:** `apps/webapp/src/app/app/patient/notifications/SubscriptionsList.tsx`

Перед `<ul>` добавить:
```tsx
<p style={{ fontSize: "0.85rem", color: "#946200", background: "#fff4dc", padding: "8px 12px", borderRadius: 8 }}>
  Настройка каналов уведомлений будет доступна в ближайшем обновлении. Сейчас уведомления приходят во все подключённые каналы.
</p>
```

### Шаг 8.2: Отключить чекбоксы

Все `<input type="checkbox">` — сделать `disabled`:

**Найти:**
```tsx
disabled={pending}
```

**Заменить на:**
```tsx
disabled
```

Убрать `onChange` handler с чекбоксов (или оставить — disabled всё равно не сработает).

## Верификация

1. `pnpm run ci` — без ошибок.
2. Пользователь видит плашку "будет доступна".
3. Чекбоксы не кликабельны.
