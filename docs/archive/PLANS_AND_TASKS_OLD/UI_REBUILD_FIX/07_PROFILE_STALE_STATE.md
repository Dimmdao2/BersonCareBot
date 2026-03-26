# Fix 07 (MEDIUM): ProfileForm — обновление state после save

## Проблема

После успешного `updateDisplayName` серверный `revalidatePath` обновляет данные, но клиентский prop `displayName` остаётся старым. Кнопка "Сохранить" остаётся активной, возможны дубли.

## Файлы

- `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`

## Шаги

### Шаг 7.1: Вызвать router.refresh() после save

**Файл:** `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`

**Добавить импорт:**
```tsx
import { useRouter } from "next/navigation";
```

**В компоненте добавить:**
```tsx
const router = useRouter();
```

**В `handleSaveName`, после `setSaved(true)` добавить:**
```tsx
router.refresh();
```

Это перезагрузит серверный компонент и обновит prop `displayName`.

## Верификация

1. `pnpm run ci` — без ошибок.
2. После сохранения имени: кнопка становится disabled, displayName prop обновлён.
