# LOG — test optimization track

## 2026-04-16 — discovery

**Команды:**

- `find apps/webapp/src apps/webapp/e2e -name '*.test.ts' | wc -l` → 309
- `find apps/webapp/src -name '*.test.tsx' | wc -l` → 36
- `find apps/webapp/src/app/api -name 'route.test.ts' | wc -l` → 105
- `find apps/integrator/src -name '*.test.ts' | wc -l` → 109
- `pnpm test` + `pnpm test:webapp` с замером wall time (см. `BASELINE.md`)

**Найдено:**

- Vitest webapp включает **и** `src/**` **и** `e2e/**` в одном `--run` — in-process e2e участвуют в основном CI `pnpm test:webapp`.
- 19 файлов в `apps/webapp/e2e/*.test.ts`, включая `api-routes-inprocess.test.ts`, `api-health.test.ts`, `api-auth-exchange.test.ts`, `messaging-inprocess.test.ts`, `cms-media-inprocess.test.ts`, `live-dev.test.ts` (последний — вероятный кандидат на отдельный профиль запуска при `E2E_LIVE_DEV` — **likely**, см. `package.json` script `test:e2e:live`).

**Решения не приняты:**

- Какие именно e2e файлы дублируют colocated `route.test.ts` (требуется построчное сравнение assertion’ов).
- Нужно ли выносить часть `e2e/` из дефолтного `vitest --run` (изменение топологии CI — **высокий риск**, только с явным согласованием).
