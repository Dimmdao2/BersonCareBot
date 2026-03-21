# Fix 05 (HIGH): Добавить error handling и user feedback в server actions

## Проблема

Все server actions при невалидных данных делают `return` без возврата ошибки. DB-мутации не обёрнуты в try/catch. Пользователь не видит ни ошибки, ни подтверждения.

## Файлы

- `apps/webapp/src/app/app/patient/profile/actions.ts`
- `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts`
- `apps/webapp/src/app/app/patient/diary/lfk/actions.ts`
- `apps/webapp/src/app/app/patient/notifications/actions.ts`
- `apps/webapp/src/app/app/doctor/content/actions.ts`

## Шаги

### Шаг 5.1: Обернуть DB-вызовы в try/catch во ВСЕХ server actions

Для каждого файла: обернуть основной await в try/catch. В catch — `console.error(err)` и `return`. Не бросать unhandled exception.

**Паттерн для каждого action:**

Было:
```ts
  await deps.diaries.addSymptomEntry({ ... });
  revalidatePath(...);
```

Стало:
```ts
  try {
    await deps.diaries.addSymptomEntry({ ... });
  } catch (err) {
    console.error("addSymptomEntry failed:", err);
    return;
  }
  revalidatePath(...);
```

Применить этот паттерн к:
1. `profile/actions.ts` — `updateDisplayName`
2. `diary/symptoms/actions.ts` — `addSymptomEntry`, `createSymptomTracking`
3. `diary/lfk/actions.ts` — `addLfkSession`, `createLfkComplex`
4. `doctor/content/actions.ts` — `saveContentPage`

**Не трогать** `notifications/actions.ts` — там пока no-op.

## Верификация

1. `pnpm run ci` — без ошибок.
2. При DB failure — ошибка логируется, пользователь не видит crash page.
