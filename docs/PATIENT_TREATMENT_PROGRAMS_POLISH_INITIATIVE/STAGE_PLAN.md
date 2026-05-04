# STAGE_PLAN — Patient treatment programs (MVP)

Канон порядка и критериев: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 (п. **1.0**, **1.1a**, **1.1**).

Исполнение **строго по порядку:** **A → B → C** (data-enabler перед UI детали и списка).

## Жесткий gate перед любым исполнением

**Запрещено начинать этап без явной фиксации в `LOG.md`, что прочитаны правила.**

Обязательный минимум чтения перед стартом любого действия:

- `.cursor/rules/plan-authoring-execution-standard.mdc`
- `.cursor/rules/test-execution-policy.md`
- `.cursor/rules/pre-push-ci.mdc`
- `.cursor/rules/push-means-ci-commit-push.mdc`
- `.cursor/rules/git-commit-push-full-worktree.mdc`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/patient-ui-shared-primitives.mdc`

Обязательная запись в [`LOG.md`](LOG.md) перед реализацией:

- дата/время и этап (`A`/`B`/`C`);
- список прочитанных rules (путями);
- подтверждение scope этапа (что делаем / что не трогаем);
- какие проверки планируются на этом шаге.

## Файлы этапов (ровно три)

| Этап | Roadmap | План |
|------|---------|------|
| **A** | 1.0 `started_at` | [`STAGE_A.md`](STAGE_A.md) |
| **B** | 1.1a деталь `[instanceId]` | [`STAGE_B.md`](STAGE_B.md) |
| **C** | 1.1 список `/treatment-programs` | [`STAGE_C.md`](STAGE_C.md) |

Чек-листы и DoD каждого этапа — только в соответствующем файле выше.

---

## Операции исполнения (копипаст)

Готовые промпты на каждое действие и каждый этап:

- [`PROMPTS_COPYPASTE.md`](PROMPTS_COPYPASTE.md)

Действия:

- `A/B/C: EXEC -> AUDIT -> FIX`
- `global audit` (включая вариант `adit-global`)
- `global fix`
- `prepush postfix audit` (без push)

---

## Definition of Done всей мини-инициативы

1. Закрыты этапы A, B, C по чек-листам в [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md).
2. Заполнен [`LOG.md`](LOG.md) (решения, проверки, намеренные ограничения).
3. В [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) отмечены **1.0**, **1.1a**, **1.1** как выполненные со ссылкой на эту папку (после фактического merge).
4. Запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md) папки APP_RESTRUCTURE.
5. Для каждого этапа в `LOG.md` есть секции: `read-rules`, `scope`, `checks`, `audit-findings/fixes`, `out-of-scope`.
6. Перед push в remote: полный барьер из `.cursor/rules/pre-push-ci.mdc` (`pnpm install --frozen-lockfile && pnpm run ci`).
