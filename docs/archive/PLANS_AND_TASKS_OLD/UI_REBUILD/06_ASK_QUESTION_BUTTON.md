# Этап 6: Кнопка «Задать вопрос»

**Задачи:** P-15

## Цель

1. Показывать кнопку на всех страницах пациента (не только для browser-only).
2. Изменить визуал: полоса во всю ширину экрана, прижатая к низу.
3. Добавить padding-bottom к layout, чтобы контент не перекрывался.

## Шаги

### Шаг 6.1: Показывать на всех страницах (снять фильтр browser-only)

**Файл:** `apps/webapp/src/shared/ui/AppShell.tsx`

**Найти:**
```tsx
const isBrowserOnly =
  user &&
  !user.bindings.telegramId?.trim() &&
  !user.bindings.maxId?.trim();
```
и
```tsx
<AskQuestionFAB visible={!!isBrowserOnly} />
```

**Заменить на:**
```tsx
<AskQuestionFAB visible={user !== null} />
```

Удалить переменную `isBrowserOnly`.

### Шаг 6.2: Изменить визуал кнопки на fullwidth bar

**Файл:** `apps/webapp/src/app/globals.css`

**Найти весь блок** `.ask-question-fab` (с hover и active):

```css
.ask-question-fab {
  position: fixed;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  padding: 12px 24px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border: none;
  border-radius: 24px;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.2s, box-shadow 0.2s;
}

.ask-question-fab:hover {
  transform: translateX(-50%) scale(1.02);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
}

.ask-question-fab:active {
  transform: translateX(-50%) scale(0.98);
}
```

**Заменить на:**
```css
.ask-question-fab {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 90;
  padding: 14px 16px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
  font-size: 0.9375rem;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border: none;
  border-radius: 0;
  box-shadow: 0 -2px 12px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
}

.ask-question-fab:active {
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
}
```

### Шаг 6.3: Добавить padding-bottom к patient shell

**Файл:** `apps/webapp/src/app/globals.css`

**Найти:**
```css
.app-shell--patient {
  padding: 0 16px 32px;
  padding-bottom: max(32px, env(safe-area-inset-bottom));
```

**Заменить на:**
```css
.app-shell--patient {
  padding: 0 16px 32px;
  padding-bottom: max(72px, calc(52px + env(safe-area-inset-bottom)));
```

72px — высота кнопки (~52px) + зазор. Контент не будет перекрыт.

### Шаг 6.4: Убрать hover transform из AskQuestionFAB CSS

Удалить `.ask-question-fab:hover` (с transform: translateX(-50%)) — больше не нужен, т.к. кнопка не центрирована через transform.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Кнопка «Задать вопрос» видна на всех страницах пациента.
3. Кнопка — полоса во всю ширину, прижата к низу экрана.
4. Содержимое страниц не перекрывается кнопкой (виден отступ снизу).
5. По клику открывается панель ввода вопроса (существующая логика сохраняется).
