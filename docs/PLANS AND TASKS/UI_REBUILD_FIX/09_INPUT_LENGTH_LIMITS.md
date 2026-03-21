# Fix 09 (MEDIUM): Ограничения длины в server actions

## Проблема

Нет max-length для `displayName`, `symptomTitle`, `complexTitle`, `body_html`, `notes`. Очень большие значения могут вызвать проблемы в БД и UI.

## Файлы

- `apps/webapp/src/app/app/patient/profile/actions.ts`
- `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts`
- `apps/webapp/src/app/app/patient/diary/lfk/actions.ts`
- `apps/webapp/src/app/app/doctor/content/actions.ts`

## Шаги

### Шаг 9.1: profile/actions.ts — displayName max 200

**Добавить после `trimmedName` проверки:**
```ts
if (trimmedName.length > 200) return;
```

### Шаг 9.2: symptoms/actions.ts — limits

**addSymptomEntry:**
После `const notes = ...`:
```ts
if (notes && notes.length > 2000) return;
```

**createSymptomTracking:**
После trim:
```ts
if (symptomTitleRaw.trim().length > 200) return;
```

### Шаг 9.3: lfk/actions.ts — complexTitle max 200

После trim title:
```ts
if (title.length > 200) return;
```

### Шаг 9.4: doctor/content/actions.ts — limits

После переменных:
```ts
if (title.length > 500) return;
if (summary.length > 2000) return;
if (bodyHtml.length > 50000) return;
if (slug.length > 200) return;
```

## Верификация

1. `pnpm run ci` — без ошибок.
