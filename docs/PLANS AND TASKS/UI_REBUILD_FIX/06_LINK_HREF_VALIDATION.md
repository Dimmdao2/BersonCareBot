# Fix 06 (HIGH): Валидация href для appointment.link

## Проблема

`appointment.link` из payload integrator рендерится как `<a href={...}>` без проверки схемы. Может содержать `javascript:`, `data:` или open-redirect URL.

## Файлы

- `apps/webapp/src/app/app/patient/cabinet/page.tsx`

## Шаги

### Шаг 6.1: Добавить функцию валидации URL

**Файл:** `apps/webapp/src/app/app/patient/cabinet/page.tsx`

Добавить в начало файла (после импортов):

```ts
function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
```

### Шаг 6.2: Применить в рендере ссылок

Найти место где `appointment.link` рендерится в `<a href={...}>`. Обернуть:

Было:
```tsx
<a href={appointment.link} ...>
```

Стало:
```tsx
{appointment.link && isSafeHref(appointment.link) ? (
  <a href={appointment.link} target="_blank" rel="noopener noreferrer" ...>
    {appointment.label}
  </a>
) : (
  <span>{appointment.label}</span>
)}
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. Ссылки с `https://` работают.
3. Ссылки с `javascript:` не рендерятся как `<a>`.
