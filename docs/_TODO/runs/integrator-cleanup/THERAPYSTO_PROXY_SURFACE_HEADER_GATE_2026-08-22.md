# Гейт: proxy кладёт заголовки поверхности — отчёт инъекций

**Дата:** 2026-08-22. **Коммит:** `51631fedf`. **Ветка:** `wt/therapysto-stage-a-20260822`.
**Автор правки:** ведущий (Opus 5). **Повод:** находка `R4-1` независимого аудита круга 4
(`AUDIT_STAGE_A_ROUND4_2026-08-22.md`).

## Что закрывалось

Гейт этапа `A` проверял, ГДЕ ставится заголовок поверхности (накрытие `config.matcher`), и не проверял, ЧТО
ставится. Удаление одной строки `requestHeaders.set(SURFACE_PATHNAME_HEADER, pathname)` в `apps/webapp/src/proxy.ts`
молча возвращало **три уже закрытые находки** — `/app?intent=specialist`, `/app/contact-support?from=clinic-demo`,
`?from=staff-factor` снова отдавали пациентскую идентичность — при полностью зелёном наборе тестов.

## Kill-set и результат

Blind kill-set составлен до правки, по authority (`TPB-08`, Gate A): **1 поломка**.

| # | Инъекция | Ожидание | Факт |
|---|---|---|---|
| 1 | удалить `requestHeaders.set(SURFACE_PATHNAME_HEADER, pathname)` в `proxy.ts` | набор краснеет | **убита** — `Tests 4 failed \| 14 passed (18)` |

- **Убитых: 1 из 1. Непойманного: 0.**
- После возврата строки: `Tests 18 passed (18)`.
- `pnpm exec eslint src/proxy.route.test.ts` exit 0; `pnpm --filter webapp typecheck` exit 0.
- `git diff -- apps/webapp/src/proxy.ts` после восстановления пуст — временная поломка откачена.

## Что добавлено

`apps/webapp/src/proxy.route.test.ts` — блок «proxy доносит до layout путь и строку запроса поверхности»:
четыре случая на заголовок пути (включая залогиненные `/app/patient` и `/app/doctor/patients`, чтобы не
попасть на редирект неаутентифицированного) и два на строку запроса (`?from=clinic-demo`, `?intent=specialist`
— именно они различают staff-адрес от пациентского). Постоянного теста «в коде есть такая-то строка» не
заводилось: проверяется поведение `proxy`, а не текст файла.
