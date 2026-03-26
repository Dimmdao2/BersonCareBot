# TAILWIND + SHADCN: инструкция для слабого агента (Composer 1.5)

Документ для предсказуемой работы с низкой точностью. **По умолчанию на `main` миграция уже завершена** — выполняется только **регресс-контроль** и точечные правки при нарушении DoD.

**Источник истины по требованиям и актуальному статусу:**  
[docs/CLEAN STYLE/TAILWIND_SHADCN_MIGRATION_REPORT_AND_PLAN.md](TAILWIND_SHADCN_MIGRATION_REPORT_AND_PLAN.md) (раздел **«Current status on main»**).

**Исторический аудит ветки миграции (не переписывать факты):**  
[TAILWIND_SHADCN_MIGRATION_EXECUTION_REPORT_cursor-bc-7b26404f-dcc5-4acd-9ab6-b9bee8761bd9-dbbe.md](TAILWIND_SHADCN_MIGRATION_EXECUTION_REPORT_cursor-bc-7b26404f-dcc5-4acd-9ab6-b9bee8761bd9-dbbe.md) — для сравнения «как было на ветке»; текущее состояние кода — только по основному плану и baseline ниже.

---

## 0. Главные правила (обязательные)

1. Делай **маленькие** изменения: максимум один логический блок за итерацию; не правь 20+ файлов без необходимости.
2. После каждого блока с кодом: минимум `pnpm --dir apps/webapp typecheck`; при падении — почини, потом продолжай.
3. **Не трогай** `apps/webapp/src/app/global-error.tsx` (inline styles и raw `<button>` там допустимы по контракту Next.js).
4. **Не удаляй** из `globals.css`: `.markdown-preview*`, `.lfk-diary-range*`.
5. Не меняй бизнес-логику — только UI, стили, унификация компонентов.
6. Если сомневаешься — копируй паттерн из уже мигрированного соседнего файла.
7. Перед пушем: `pnpm install --frozen-lockfile` и `pnpm run ci`.

---

## 1. Режим A — регресс-контроль (по умолчанию на `main`)

Используй **всегда первым** при любом PR/задаче по webapp-стилям.

### 1.1 Preflight

- Ветка `main` (или feature от актуального `main`), рабочее дерево понятно (нет лишних незакоммиченных смесей без причины).

### 1.2 Baseline-команды (скопировать как есть)

```bash
# Legacy className (паттерн из основного плана §9)
rg "className=\"[^\"]*(panel|hero-card|feature-card|feature-grid|list-item|eyebrow|button--|badge--|auth-input|top-bar|app-shell|stack\b|empty-state|user-pill|kpi-|master-detail|client-row|ask-question)" apps/webapp/src --glob "*.tsx"

# Inline styles
rg "style=\{\{" apps/webapp/src --glob "*.tsx"

# Raw buttons
rg "<button\b" apps/webapp/src --glob "*.tsx"

# PageHeader не должен вернуться (на main файл удалён)
rg "from ['\"]@/shared/ui/PageHeader['\"]" apps/webapp/src
```

**Ожидаемый результат на здоровом `main`:**

| Команда | Ожидание |
|---------|----------|
| Legacy `className` | 0 совпадений |
| `style={{` | только `apps/webapp/src/app/global-error.tsx` |
| `<button` | только `apps/webapp/src/app/global-error.tsx` |
| `PageHeader` import | 0 совпадений |

### 1.3 Если baseline зелёный

- **Не** запускай заново «активную миграцию» (фазы A–F из приложения ниже).
- Делай только то, что требует задача (например, правка одного компонента), с малым диффом.
- После изменений кода: снова прогони команды из §1.2 и `pnpm --dir apps/webapp typecheck`.
- Перед пушем: `pnpm install --frozen-lockfile` и `pnpm run ci`.

### 1.4 Если baseline красный

- Зафиксируй в отчёте: какая команда упала и примеры файлов.
- Переходи к **режиму B** (или к точечному исправлению по основному плану §8, без массовых автозамен).

---

## 2. Режим B — восстановление DoD (если регресс)

1. Открой [TAILWIND_SHADCN_MIGRATION_REPORT_AND_PLAN.md](TAILWIND_SHADCN_MIGRATION_REPORT_AND_PLAN.md) — §2 Definition of Done, §5 матрица замен, §8 пошаговые фазы.
2. Работай **батчами**, как в §7 «Минимальный безопасный темп» этого файла.
3. Используй **приложение** ниже (бывшие фазы A–F) как напоминание порядка; детали и точные пути — в основном плане.
4. После каждого батча: `pnpm --dir apps/webapp typecheck` и снова §1.2.

---

## 3. Команды сборки

```bash
pnpm --dir apps/webapp typecheck
```

Финально перед push:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

---

## 4. Финальный чеклист DoD

Задача по стилям считается закрытой только если:

1. `rg "style=\{\{"` — только `app/global-error.tsx`.
2. `rg "<button\b"` — только допустимые исключения (на здоровом `main` обычно только `global-error.tsx`; иные исключения согласовать с основным планом).
3. Legacy `className` по паттерну из §1.2 — 0.
4. Нет локальных `function Toggle(` в `app/app/settings`.
5. `globals.css` — только разрешённые блоки (см. основной план §3).
6. `pnpm --dir apps/webapp typecheck` — зелёный.
7. `pnpm install --frozen-lockfile` и `pnpm run ci` — зелёные.

---

## 5. Формат отчёта агента (обязательный)

1. **Сделано** — файлы и суть правок.
2. **Проверки** — точные команды и результат (в т.ч. §1.2).
3. **Осталось** — только реальные хвосты.
4. **Риски** — UI/поведение.
5. **Итог по DoD** — `[x]` / `[ ]` по пунктам раздела 4.

---

## 6. Запрещено

1. Массовая автозамена без проверки каждого файла.
2. Изменение бизнес-логики под видом стилей.
3. Удаление `.markdown-preview*` и `.lfk-diary-range*` из `globals.css`.
4. Удаление inline styles из `global-error.tsx`.
5. Пуш без зелёного `pnpm run ci`.

---

## 7. Минимальный безопасный темп

1. Один небольшой батч (1–3 файла или одна зона).
2. Правки.
3. `pnpm --dir apps/webapp typecheck`.
4. Команды из §1.2 (если менялся UI-код).
5. Следующий батч.

---

## Приложение: активная миграция (если DoD нарушен)

Использовать **только** когда baseline §1.2 не зелёный. Подробности и пути файлов — в основном плане §8.

| Шаг | Суть |
|-----|------|
| A | Убрать дубли: `LabeledSwitch` в settings; `SegmentControl` / `NumericChipGroup` в дневнике |
| B | Raw `<button>` → `Button` где применимо (исключения: `global-error`, DnD, hidden submit) |
| C | Убрать `style={{` кроме `global-error` |
| D | Замена legacy `className` батчами (`stack`, `panel`, `auth-input`, …) |
| E | Чистка `globals.css` до токенов + markdown + range + `safe-*` |
| F | Финальная выверка заголовков (`SectionHeading`) и форм |

После восстановления DoD снова переключайся на **режим A** (регресс по умолчанию).
