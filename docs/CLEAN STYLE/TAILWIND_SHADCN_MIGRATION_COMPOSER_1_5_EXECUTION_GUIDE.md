# TAILWIND + SHADCN Migration: супер-подробная инструкция для слабого агента (Composer 1.5)

Этот документ нужен, чтобы агент с низкой точностью сделал миграцию безопасно и предсказуемо.
Работай строго по шагам ниже, ничего не пропускай, не делай "умных" массовых рефакторингов.

Основной источник требований:
- `docs/CLEAN STYLE/TAILWIND_SHADCN_MIGRATION_REPORT_AND_PLAN.md`

---

## 0. Главные правила (обязательные)

1. Делай маленькие изменения.
   - Максимум 1 логический блок за итерацию.
   - Не редактируй сразу 20+ файлов.
2. После КАЖДОГО блока запускай проверку:
   - минимум: `pnpm --dir apps/webapp typecheck`
   - если упало — сначала почини, потом дальше.
3. Не трогай `apps/webapp/src/app/global-error.tsx` (inline styles там допустимы по контракту Next.js).
4. Не удаляй из `globals.css`:
   - `.markdown-preview*`
   - `.lfk-diary-range*`
5. Не меняй бизнес-логику, меняй только UI-слой/стилизацию/унификацию компонентов.
6. Если сомневаешься — не изобретай, копируй паттерн из соседнего уже мигрированного файла.
7. Перед пушем обязателен полный CI:
   - `pnpm install --frozen-lockfile`
   - `pnpm run ci`

---

## 1. Текущее состояние (факты, от которых отталкиваемся)

На момент старта миграция НЕ завершена:
- legacy classes: много совпадений (в т.ч. `stack`, `panel`, `auth-input`, `eyebrow`, `empty-state`)
- inline styles есть во многих файлах
- raw `<button>` еще есть
- в settings есть 2 локальных Toggle вместо shadcn Switch
- `globals.css` содержит большой legacy слой

Значит работать нужно по фазам ниже, а не "одним большим коммитом".

---

## 2. Команды контроля (использовать постоянно)

### 2.1 Быстрые поисковые проверки

```bash
# Legacy классы
rg "className=\"[^\"]*(panel|hero-card|feature-card|feature-grid|list-item|eyebrow|button--|badge--|auth-input|top-bar|app-shell|stack\b|empty-state|user-pill|kpi-|master-detail|client-row|ask-question)" apps/webapp/src --glob "*.tsx"

# Inline styles
rg "style=\{\{" apps/webapp/src --glob "*.tsx"

# Raw buttons
rg "<button\b" apps/webapp/src --glob "*.tsx"
```

### 2.2 Проверки сборки

```bash
pnpm --dir apps/webapp typecheck
```

Финальный обязательный прогон перед push:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

---

## 3. Порядок работ (строго по фазам)

Ниже порядок, который нельзя менять местами без причины.

## Фаза A. Убрать функциональные дубли (самый безопасный старт)

### A1. Заменить локальные Toggle в settings

Файлы:
- `apps/webapp/src/app/app/settings/SettingsForm.tsx`
- `apps/webapp/src/app/app/settings/AdminSettingsSection.tsx`

Что сделать:
1. Удалить локальные `function Toggle(...)`.
2. Использовать shadcn `Switch` (или общий `LabeledSwitch`, если уже создан).
3. Сохранить текущие `checked/onChange/disabled` сценарии.
4. Проверить доступность (`aria-*`) не ухудшилась.

Проверка:
```bash
pnpm --dir apps/webapp typecheck
rg "function Toggle\(" apps/webapp/src/app/app/settings --glob "*.tsx"
```

Ожидание: `rg` не должен находить локальные Toggle в settings.

---

### A2. Привести segmented controls/чипы к общему виду

Файлы-цели:
- `apps/webapp/src/modules/diaries/components/DiaryStatsPeriodBar.tsx`
- `apps/webapp/src/app/app/patient/diary/symptoms/CreateTrackingForm.tsx`
- `apps/webapp/src/app/app/patient/diary/symptoms/AddEntryForm.tsx`
- `apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx`

Что сделать:
1. Для переключателей периода/side использовать единый компонент (`SegmentControl`).
2. Для 0..10 использовать единый компонент (`NumericChipGroup`).
3. Визуально сохранить состояния active/inactive и кликабельность.

Проверка:
```bash
pnpm --dir apps/webapp typecheck
```

---

## Фаза B. Убрать raw `<button>` для обычных действий

Целевые файлы:
- `apps/webapp/src/shared/ui/AskQuestionFAB.tsx`
- `apps/webapp/src/app/app/doctor/appointments/DoctorAppointmentActions.tsx`
- `apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx`
- `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`

Особые случаи (оставить raw button можно):
- DnD handle в `TemplateEditor.tsx` (если реально завязан на listeners/attributes)
- hidden submit или технические служебные кнопки
- `global-error.tsx`

Что сделать:
1. Для обычных action-кнопок перейти на `Button` из `@/components/ui/button`.
2. Подобрать variant/size по контексту (`default`, `outline`, `ghost`, `destructive`, `sm` и т.д.).
3. Сохранить id/data-testid/доступность.

Проверка:
```bash
pnpm --dir apps/webapp typecheck
rg "<button\b" apps/webapp/src --glob "*.tsx"
```

Ожидание: остаются только допустимые исключения.

---

## Фаза C. Убрать inline styles (кроме global-error)

Приоритетные файлы:
1. `apps/webapp/src/app/app/doctor/content/page.tsx`
2. `apps/webapp/src/app/app/doctor/content/news/NewsForms.tsx`
3. `apps/webapp/src/app/app/doctor/messages/NewMessageForm.tsx`
4. `apps/webapp/src/app/app/doctor/clients/[userId]/SendMessageForm.tsx`
5. `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`

Потом остальные файлы, где есть `style={{...}}`.

Правило:
- каждую inline-конструкцию переноси в Tailwind-классы;
- если Tailwind-класс неочевиден, используй уже существующий паттерн в проекте.

Проверка:
```bash
pnpm --dir apps/webapp typecheck
rg "style=\{\{" apps/webapp/src --glob "*.tsx"
```

Ожидание: остается только `app/global-error.tsx` (и только там).

---

## Фаза D. Массовая замена legacy className

Делать по батчам, не все сразу.

### D1. `stack`
- `stack` -> `flex flex-col gap-4` (или `grid gap-4`, если действительно нужна grid-модель)

Важно: после `grid -> flex` иногда надо добавить `w-full` дочерним элементам.

### D2. `panel`, `hero-card`, `feature-*`
- перейти на `Card`/`PageSection`/обычные Tailwind-контейнеры

### D3. `list`, `list-item`
- `list` -> `list-none p-0 m-0 space-y-3` (или `grid gap-3`)
- `list-item` -> `rounded-lg border border-border bg-card p-3`

### D4. `eyebrow`
- заменить на utility-классы:
  - `text-xs font-medium uppercase tracking-wide text-muted-foreground`
  - или через общий `SectionHeading level="eyebrow"`

### D5. `auth-input`
- input -> `Input`
- textarea -> `Textarea`
- select -> shadcn `Select` или выровненный по стилю className

### D6. `empty-state`
- заменить на `text-muted-foreground` (+ нужные text-size классы рядом)

### D7. Остатки
- `top-bar`, `badge--*`, `user-pill`, `kpi-*`, `overview-columns`, `master-detail`, `client-row`, `auth-plaque`, `code-block`, `ask-question-*`

После каждого батча:
```bash
pnpm --dir apps/webapp typecheck
```

После каждого крупного батча:
```bash
rg "className=\"[^\"]*(panel|hero-card|feature-card|feature-grid|list-item|eyebrow|button--|badge--|auth-input|top-bar|app-shell|stack\b|empty-state|user-pill|kpi-|master-detail|client-row|ask-question)" apps/webapp/src --glob "*.tsx"
```

---

## Фаза E. Очистка `globals.css`

Файл:
- `apps/webapp/src/app/globals.css`

Что оставить:
1. Импорты tailwind/shadcn
2. tokens (`:root`, `.dark`)
3. `@theme inline`
4. `@layer base`
5. `a { ... }` reset
6. `.markdown-preview*`
7. `.lfk-diary-range*`
8. safe-area utilities (с новыми именами, см. ниже)

Safe-area rename:
- `.app-shell--patient` -> `.safe-padding-patient`
- `.patient-edge-bleed` -> `.safe-bleed-x`
- `.patient-fab-quick-add` -> `.safe-fab-br`

И обязательно обновить usage в компонентах:
- `shared/ui/AppShell.tsx`
- `shared/ui/PatientHeader.tsx`
- `app/app/patient/diary/DiaryTabsClient.tsx`
- `app/app/patient/diary/QuickAddPopup.tsx`

Что удалить:
- весь legacy component-level CSS
- мертвый блок `.ask-question-panel*` (если нигде не используется)

Проверка:
```bash
pnpm --dir apps/webapp typecheck
rg "ask-question-panel|top-bar|auth-input|feature-card|hero-card|panel|stack|user-pill|kpi-card|master-detail|client-row" apps/webapp/src/app/globals.css
```

Ожидание: нет legacy-блоков, только разрешенный минимум.

---

## Фаза F. Финальная стандартизация

1. Проверить заголовки (`h1..h3`) и `eyebrow`:
   - где возможно, свести к единым компонентам/классам.
2. Решить судьбу `shared/ui/PageHeader.tsx`:
   - либо внедрить,
   - либо удалить как неиспользуемый код.

Проверка:
```bash
pnpm --dir apps/webapp typecheck
```

---

## 4. Финальный чеклист готовности (Definition of Done)

Считаем задачу завершенной только если ВСЕ пункты ниже выполнены:

1. `rg "style=\{\{" apps/webapp/src --glob "*.tsx"`:
   - остается только `app/global-error.tsx`.
2. `rg "<button\b" apps/webapp/src --glob "*.tsx"`:
   - остаются только разрешенные исключения (hidden submit / dnd handle / global-error fallback).
3. `rg legacy-class-pattern ...`:
   - 0 недопустимых legacy className.
4. Локальных `function Toggle(...)` в settings нет.
5. `globals.css` очищен до разрешенных блоков.
6. `pnpm --dir apps/webapp typecheck` — зеленый.
7. `pnpm install --frozen-lockfile` и `pnpm run ci` — зеленые.

---

## 5. Формат отчета агента (обязательный)

После завершения агент обязан дать отчет в таком формате:

1. `Сделано` (список файлов и что изменено)
2. `Проверки` (точные команды + результаты)
3. `Осталось` (что не удалось и почему)
4. `Риски` (UI-риски, где может отличаться поведение)
5. `Итог по DoD`:
   - `[x]` / `[ ]` по каждому пункту из раздела 4

Без этого отчета работа считается незавершенной.

---

## 6. Запрещенные действия

1. Массовая автозамена без проверки каждого файла.
2. Изменение серверной/бизнес-логики.
3. Удаление `.markdown-preview*` и `.lfk-diary-range*` из `globals.css`.
4. Удаление inline styles из `global-error.tsx`.
5. Пуш без зеленого CI.

---

## 7. Минимальный безопасный темп

Рекомендуемый цикл:
1. Взять 1 батч (например, только `SettingsForm.tsx` + `AdminSettingsSection.tsx`)
2. Внести правки
3. `pnpm --dir apps/webapp typecheck`
4. Запустить нужные `rg` проверки
5. Только потом следующий батч

Такой темп обязателен для слабого агента.
