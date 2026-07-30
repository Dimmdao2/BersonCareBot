# Полная приёмка DB-free пилота — Claude Opus 5 — 2026-07-30

Источник:
`/home/dev/brain/runs/agent-port/bcb-1074-opus-final-acceptance-20260730.json`

Run id: `bcb-1074-opus-final-acceptance-20260730`.
Модель/режим: `claude-opus-5`, `xhigh`, read-only.
Проверенный HEAD: `7cdbbe727fbeed0c00685da981e93149675b2194`.

Этот файл сохраняет полный содержательный результат приёмки. Канонические решения, evidence и статус остаются
в `TEST_SUITE_AUDIT_2026-07-29.md`; raw run выше содержит дословный ответ модели и полную телеметрию.

## Вердикт первого прохода

**FAIL — один узкий блокер записи доказательств.**

Все четыре пилотных файла признаны рабочими и полезными. Единственная причина FAIL: выполненные red-on-fault
инъекции существовали в отчётах исполнителей и commit evidence, но не были записаны строками
«что сломано → какое утверждение покраснело» в каноническом плане #1074.

## Матрица приёмки

| Вопрос | Вердикт | Основание |
| --- | --- | --- |
| A. Реальное публичное поведение, последствия и независимый oracle | PASS, 4/4 | Каждый тест прослежен до production handler/proxy/module API |
| B. Достаточны ли две группы для узкой цели #1074 | PASS | Это первые две группы принятой risk-based партии: request security и auth/session |
| C. Исполнимы ли suffix/layer/builders/property/fault-injection правила | PASS, кроме отсутствовавшей записи fault evidence | Runner/CI, builders и Zod bridge реальны; новый DSL не создан |
| D. Достаточны ли три практических уточнения канона | PASS с двумя переформулировками | Route wiring принят; запрет копии алгоритма ограничен собственным кодом; injection привязан к классу поломки |
| E. Есть ли другой блокер закрытия | Нет | DB/RLS и массовое покрытие явно вне текущей цели |

## Проверка четырёх пилотных файлов

### `apps/webapp/src/proxy.route.test.ts`

PASS. Тест импортирует настоящий Next proxy и проверяет canonical same-origin, foreign/missing/ambiguous source,
точное exemption и near-match. Он ловит реальный класс CSRF bypass, а не текст или внутренний call count.

### `apps/webapp/src/app/api/doctor/requestAccess.route.test.ts`

PASS. Тест вызывает настоящий representative `PATCH` handler, поэтому удаление route wiring к
`requireDoctorWorkspaceApiContext` делает его красным. Отдельно проверен опасный путь
platform-admin → clinic workspace.

### `apps/webapp/src/modules/auth/sessionCookie.unit.test.ts`

PASS. Невалидные payload создаются через публичный encoder; ручного HMAC и копии production-формата нет.
Проверены malformed/incomplete/tampered/expired формы, TTL/absolute-age boundaries и публичное renewal outcome.

### `apps/webapp/src/modules/auth/passwordAuth.route.test.ts`

PASS. Тест вызывает настоящие login/reset/password-change handlers. Защищены нейтральные ошибки, lockout без
session, точный OTP purpose `password_reset`, fail-closed reset при ошибке revocation-порта и честный
partial-success после смены пароля.

Неблокирующее наблюдение Opus: login-тест сравнивает только публично выбранные поля
`status/error/message`, а не полную форму двух 401 body. Это не finding: named enumeration claim остаётся
валидным, независимого требования к равенству остальных полей нет.

## Единственный blocking finding

Owner-boundary требует четыре части: автоматический runner, полезные тесты с независимым oracle,
red-on-fault evidence и независимую смысловую приёмку. На момент первого Opus-прохода только третья часть не имела
записи в плане. Это не требовало нового кода или нового прогона: требовалось перенести уже сохранённые результаты
четырёх инъекций в `TEST_SUITE_AUDIT_2026-07-29.md`.

После такой записи других blocking findings нет.

## Повторная приёмка коррекции

Raw read-only run:
`/home/dev/brain/runs/agent-port/bcb-1074-opus-final-reaudit-r2-20260730.json`.

Модель/режим: `claude-opus-5`, `medium`. Итог: **PASS**.

- BF-1: CLOSED — все четыре выполненные инъекции записаны с commit hash и красным assertion.
- Canon 1/2/3: PASS — обе инструкции зеркальны и не запрещают независимый oracle внешней спецификации.
- Other blocking findings: none.

Opus не имел Bash и отметил только невозможность самостоятельно сверить два auth-хеша с git history.
Оркестратор сверил их командой
`git show -s --format='%H%n%B' e5fda04e1 e18d4a9c8`: `e5fda04e1` содержит expiry-boundary injection,
`e18d4a9c8` — `passwordChanged: true → false`; атрибуция в плане верна.

## Принятые уточнения канона

1. Если заявлено поведение маршрута, `*.route.test.ts` вызывает реальный публичный handler/proxy вместе с wiring;
   прямой тест guard/service не доказывает защиту маршрута.
2. Запрещено копировать алгоритм кодирования/подписи/протокола собственной реализации ради собственного oracle.
   Публичный builder/encoder используется для внутренних форматов. Независимая реализация внешней опубликованной
   спецификации остаётся допустимым oracle.
3. Fault injection выполняется один раз на каждый независимый класс поломки, а не на каждый `it` и не на
   `describe` целиком. Evidence записывается как «что сломано → какое утверждение покраснело».

Opus отдельно подтвердил, что четвёртого практического урока из пилота нет: determinism, harness self-test и
runner/CI reachability уже описаны действующим каноном.

## Явно вне #1074

- PostgreSQL/RLS/ACL/concurrency matrix — после аудита ролей/стен, стабилизации БД и owner-go.
- DB-backed session revocation и OTP atomic consume.
- `pg-harness.ts` остаётся contract-only stub и не является DB evidence.
- quotas/entitlements.
- Остальные модули inventory: тестируются дальше по риску в обычной разработке, не массовым хвостом этой карточки.

## Что проверил Opus

Прочитаны четыре пилотных теста, соответствующие production handlers/modules, `AGENTS.md` §10/10a/10b,
`.cursor/rules/test-execution-policy.md`, `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`,
основной план, критичный Sol inventory, Vitest config, package scripts и CI workflow.

Команд Opus не запускал: его sandbox был read-only, а уже выполненные targeted проверки не повторялись по strong
reuse rule. Отдельный оркестраторский phase gate после приёмки:
`pnpm test:webapp:behavior` → unit 2 файла/12 тестов, route 3/17, UI 1/2, всё PASS.
