# Stale checkboxes B — 2026-08-20

Планы не изменялись. В таблицу внесены только пункты с прямым совпадением
требования и действующей реализации.

| Файл:строка | Текст пункта (сокращённо) | Доказательство | Насколько уверен |
| --- | --- | --- | --- |
| `docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md:107` | Убрать regex из `require_accepted_context` | `deploy/postgres/port-context/contract.sql:415-439`: в условии остались только role/function/hash checks, regex для `p_purpose` отсутствует; commit `499b64ddc` удалил именно это условие. | точно |
| `docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md:109` | Убрать no-op `ON CONFLICT DO UPDATE` в `resolve_variant_a_identity` | `deploy/postgres/port-context/contract.sql:533-572`: сначала read, затем `ON CONFLICT (physical_user_id) DO NOTHING` и bounded retry, без UPDATE; commit `b7da1ef8e` реализовал эту замену. | точно |

Просмотрено: **243** открытых checkbox-пункта. Заявлено сделанными: **2**; из них «точно»: **2**, «вероятно»: **0**.

Число получено командой:

```bash
while IFS= read -r plan_file; do rg -c -- '^\\s*- \\[ \\]' "$plan_file" || true; done < /tmp/claude-1001/-home-dev-dev-projects-BersonCareBot/aa764655-646f-40e6-8c9a-d8894b9735ec/scratchpad/plansB.txt
```
