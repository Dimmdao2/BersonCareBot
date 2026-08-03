# D27-A1 — закрыть phone/channel enumeration до восстановления выбора канала

## Authority

- Прочитать `AGENTS.md`, особенно §5, §7, §9–§10 и §24.
- Owner checklist: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, **Р-D27** и **D27**.
- Behavior canon: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §3.2–§3.6.

Источник оракула: `WORK_ORDER.md` Р-D27 — «экран не должен подсказывать постороннему, какие каналы есть у владельца номера»; `IDENTITY_AND_MERGE_SCHEME.md` §3.3 — «Если канал у человека привязан — код туда уходит. Если не привязан — не уходит. Сообщение на экране всегда одинаковое».

## Измеренная реальность

- Anonymous `GET/POST /api/auth/check-phone` возвращает `exists`, TG/MAX binding booleans, email existence,
  полный email и preferred channel. Это достижимое перечисление аккаунта/каналов.
- Browser phone start уже отправляет только phone и не использует personalised check, но legacy MiniApp flow ещё
  читает контракт. Authenticated profile-bind тоже нельзя сломать: self-scoped capability отделить/сохранить.
- Существующие phone public responses уже имеют fixed minimum 500ms и neutral body; это pattern.

## Задача worker — только D27-A1

1. Убрать anonymous personalized `check-phone` contract. Публичный login может видеть только глобально
   configured+enabled channel availability и opaque challenge/result — никаких account existence, bindings,
   preferred channel или email/address.
2. Сохранить нужную authenticated self-scoped profile-bind способность отдельной существующей дверью либо
   минимальным self-scoped port/route; не возвращать сведения anonymous caller.
3. Адаптировать legacy MiniApp/browser callers к neutral contract. Никаких текстов/списков, зависящих от
   привязок введённого номера.
4. Добавить behavior tests до/после: known vs unknown, разные bindings/PIN/preference дают byte-equivalent ответ;
   identity ports не вызываются; полный email и account-derived поля рекурсивно отсутствуют. Меняться для обоих
   телефонов могут только глобальные configured+enabled capabilities. Fault injection должен доказать oracle.
5. Сохранить оба compatibility caller: старый bundle после deploy не должен сломаться; existing explicit
   `/phone/start` по-прежнему neutral suppress-ит absent account/binding.
6. Обновить D27 как CURRENT PARTIAL, не ставить `[x]`: email enumeration, preference UI, durable auth queue и full channel screen ещё
   впереди.

## Граница

- Разрешены только `check-phone` route/service/ports, два прямых UI caller, targeted tests и документы D27.
- Не трогать D25 identity/merge/provenance, D30 queues, тарифы/CMS, DB migrations, deploy/env/DEV/TEST/PROD.
- Не менять phone/email delivery, политику channel enabled+configured, attempts/lockout/session/2FA и recent email principal fix.

## Готовность

- Один coherent commit в `wt/trackd-d27a1-enumeration`, дерево чистое.
- Targeted tests, webapp typecheck/lint, auth/import/boundary gates и `git diff --check` PASS.
- Handoff содержит SHA, точные команды, kill cases и остаток D27-B/C/D/E.
