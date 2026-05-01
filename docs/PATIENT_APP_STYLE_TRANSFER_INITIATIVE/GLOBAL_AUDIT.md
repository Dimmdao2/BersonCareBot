# GLOBAL AUDIT — Patient App Style Transfer

**Статус:** подготовка (Phase 5 EXEC **2026-05-01**). Вердикт глобального аудита и §1–8 по шаблону **ещё не заполнены** — выполнить отдельной audit-сессией по разделу «Как провести аудит» ниже.

## 1. Prerequisites (перед закрытием инициативы)

| Условие | Состояние на prep |
|--------|-------------------|
| Есть `AUDIT_PHASE_0.md` … `AUDIT_PHASE_5.md` | Да |
| Mandatory findings закрыты | Да — см. §2 |
| `CHECKLISTS.md` §4 / §4.1 согласованы с `LOG.md` и `PLAN_INVENTORY.md` | Обновлено в Phase 5 |
| Нет заведомых нарушений style-only границ без записи в документах | Подтвердить при выполнении аудита |

## 2. Mandatory fixes — closure summary

| Фаза | §3 аудита | Закрытие |
|------|-----------|----------|
| 0 | `PLAN_INVENTORY.md` отсутствовал; запись в `LOG.md` | **Закрыто** — `PLAN_INVENTORY.md` создан; `LOG.md` Phase 0 FIX |
| 1 | No mandatory fixes | N/A |
| 2 | No mandatory fixes | N/A |
| 3 | No mandatory fixes | N/A |
| 4 | No mandatory fixes | N/A |
| 5 | No mandatory fixes (`AUDIT_PHASE_5.md` §3) | N/A |

## 3. Как провести аудит (заполнить этот файл)

1. Прочитать **`AUDIT_TEMPLATE.md`**, **`MASTER_PLAN.md`**, **`LOG.md`**, **`CHECKLISTS.md`** (в т.ч. §4.1 deferred routes).
2. Выполнить чеклист из **`05_QA_DOCS_PLAN.md`** (visual QA и grep — по выборке; скриншоты опциональны, пути — в `LOG.md` при наличии).
3. Оформить разделы **1–8** как в шаблоне: вердикт, style-only scope, mandatory fixes (если появятся), minor notes, команды, покрытие маршрутов, deferred product/content, readiness (закрытие инициативы да/нет).
4. Заменить шапку «Status» на итоговый вердикт и дату audit-сессии.

## 4. Область сверх матрицы §4 (`CHECKLISTS.md`)

Явно проверить **deferred routes** из **`CHECKLISTS.md` §4.1**: отсутствие нежелательного разнесения **home-specific geometry** (`patientHomeCardStyles` и т.п.) на чужие страницы, согласованность с **`PLAN_INVENTORY.md`**.

## 5. Рекомендуемые команды (не root CI)

Перед финальным вердиктом — по объёму изменений patient UI:

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Плюс targeted tests из **`LOG.md`** по фазам 2–4. Root **`pnpm run ci`** — только по запросу или перед push.

## 6. Подсказки grep (опционально)

- Импорты `patientHomeCardStyles` вне `home/`: не должны появляться на «чужих» маршрутах вне явного исключения в документах.
- Паттерны style debt из **`PLAN_INVENTORY.md` §2** — для оценки остаточного долга, не как обязательный ноль в рамках style-only transfer.

---

*После выполнения глобального аудита этот файл должен содержать полный отчёт по `AUDIT_TEMPLATE.md`; до тех пор §1–2 выше — состояние Phase 5 prep.*
