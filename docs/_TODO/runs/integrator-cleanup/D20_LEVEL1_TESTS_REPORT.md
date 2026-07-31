# D20, шаг 3 — тесты УРОВНЯ 1: «вход не в тот аккаунт»

Run: `worker-d20-tests-level1`. Пишется **по ходу работы**, не постфактум.

**Authority:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` п. D20.
**Карта:** `D20_INTEGRATOR_MAP.md`, раздел «Порядок написания тестов» → **Уровень 1** (пункты 5–8).
**Уровень 0:** `D20_LEVEL0_TESTS_REPORT.md` (+41 тест) — не переделывается, взят как ориентир по стилю.
**Правила:** `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`,
`.cursor/rules/webapp-tests-lean-no-bloat.mdc`.

Push/merge не делаю, галочки плана не ставлю.

---

## Базовая линия ДО работы

```
pnpm --dir apps/integrator exec vitest run
 Test Files  14 passed | 3 skipped (17)
      Tests  88 passed | 9 skipped (97)
   Duration  5.90s
```

Совпадает с числом из отчёта уровня 0 (88).

---

## Ход работы

(заполняется по мере выполнения)
