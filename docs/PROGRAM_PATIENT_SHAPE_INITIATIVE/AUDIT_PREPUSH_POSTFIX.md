# Pre-push postfix audit — PROGRAM_PATIENT_SHAPE (и сопутствующее дерево)

**Дата:** 2026-05-03  
**Назначение:** финальная проверка перед `git push` по правилам репозитория (pre-push = `pnpm install --frozen-lockfile` + `pnpm run ci` + commit полного дерева).

---

## 1. Статус stage-аудитов и global fix

| Область | Critical / Major открытые | Источник |
|---|---|---|
| A1–A5 stage audits | **Нет** открытых блокирующих пунктов; POST-FIX по Major где были — **Fixed** в соответствующих `AUDIT_STAGE_A*.md` | `AUDIT_STAGE_A1.md` … `AUDIT_STAGE_A5.md` |
| Global fix (**GLOBAL-*** ) | **Закрыты** (**GLOBAL-CI-01**, **GLOBAL-LOG-STRUCT-01**, **GLOBAL-DOC-INDEX-01**, **GLOBAL-TZ-HEADER-01**) | [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) §9, [`LOG.md`](LOG.md) запись «Global fix» |
| Программа правок коду по незакрытым аудитам | **Не потребовалась** — открытых critical/major для инициативы не оставалось | — |

---

## 2. Pre-push барьер (актуальное дерево)

Выполнено в каталоге репозитория:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

| Шаг | Результат |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** (lockfile актуален) |
| `pnpm run ci` | **PASS** (exit 0): `lint` → `typecheck` → `check:hls-helpers-sync` → `test` (integrator) → `test:webapp` → `test:media-worker` → `build` → `build:webapp` → `audit` |

Повторов из-за падения CI **не потребовалось**.

---

## 3. Кратко: риски и остаточные эффекты

| Риск / тема | Уровень | Комментарий |
|---|---|---|
| Несколько **активных** программ у пациента на **Today** | Низкий / продукт | Бейдж «План обновлён» и контекст карточки ориентированы на одну «главную» активную программу (**A5-TODAY-INSTANCE-01**, defer). |
| Чек-лист «на сегодня» по **UTC**, не по локальной TZ пациента | Низкий / продукт | Ожидаемое ограничение до решения по IANA из `system_settings` (**A4-UTC-01**, defer). |
| Legacy **шаблоны** с конфликтом «Этап 0» vs первый клинический этап (`sort_order`) | Низкий / контент | **A2-LEGACY-01** — правка данных/гайда, не блок рантайма. |
| Новые пути добавления пунктов плана и **`last_viewed_at`** | Операционный | Регресс «ложное Новое» если забыть выставить семантику при новом коде (см. рекомендации в `AUDIT_STAGE_A5.md`). |

---

## 4. Deferred пункты (не блокируют push)

Сводка совпадает с [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) §7 (деферы) и stage-аудитами:

| ID | Суть |
|---|---|
| **A4-LOG-TYPES-01** | Отдельные записи `action_type: viewed` / семантика **note** как тип — при необходимости позже. |
| **A4-UTC-01** | Сутки чек-листа: переход с UTC на business-timezone. |
| **A5-TODAY-INSTANCE-01** | Несколько активных программ на Today. |
| **A5-TS-EQUALITY-01** | Сравнение timestamp бейджа «План обновлён» (документировано, без смены семантики). |
| **A3-UI-INST-01** | Полноценный UI редактирования instance-группы (сейчас **PATCH** API). |
| **A2-LEGACY-01** | Контент шаблонов с проблемным `sort_order`. |

---

## 5. Вердикт

- **Pre-push готовность:** **PASS** — полный CI зелёный на коммите перед push; критичных/major зазоров по инициативе **PROGRAM_PATIENT_SHAPE** не зафиксировано.
- **Commit / push:** после CI выполнены `git add -A`, commit и успешный `git push` ветки `feature/app-restructure-initiative` в `origin`.

---

## 6. Связанные документы

- [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) — итоговый аудит A1…A5.
- [`LOG.md`](LOG.md) — в т.ч. запись **Global fix** и целевые команды.
