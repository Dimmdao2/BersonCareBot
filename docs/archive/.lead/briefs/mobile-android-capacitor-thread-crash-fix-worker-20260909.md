# Worker brief — #915 Android Capacitor plugin thread crash

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M7-04: обе debug-обёртки должны
запускаться и быть доступны для emulator acceptance. Реальный finding на обеих: вызов `ShellRuntime.getRuntimeInfo`
падает `FATAL EXCEPTION: CapacitorPlugins`, потому что `TrustedOriginGate.isTrusted()` вызывает `WebView.getUrl()`
не на main thread.

## Authority and rules

Исправить один общий Android runtime defect для TherapyGo и Therapysto на exact текущем base. Перед каждым
действием выполнять heading-map gate `AGENTS.md`. Прочитать `README.md`, `AGENTS.md` §9, §10a, §10b, §12, §24,
mobile plan M2/M7-04, `apps/mobile-shell/README.md`, native bridge/origin security implementation и существующие
Android test/build conventions. Сначала `code-search`, затем точный `rg`.

Worker не пишет тесты и не меняет существующие test/audit files. Не трогать webapp, PWA, Jitsi UX, push schema,
dependencies/lockfile, plan/taskdb, TEST/PROD/DB и release signing. Не ослаблять trusted-origin security и не
разрешать нативные вызовы стороннему origin.

## Required product result

- Устранить обращение к Android WebView с `CapacitorPlugins` thread через один общий безопасный seam для всех
  native plugins, которым нужен current origin. Не размножать per-plugin/per-variant обходы.
- Origin должен читаться/кэшироваться на допустимом lifecycle/main-thread пути и оставаться актуальным после
  реальной навигации; решение не должно зависать, deadlock'иться либо принимать stale/untrusted origin.
- Оба variant используют одну реализацию; package/app branding и release/debug матрица остаются неизменными.

## Validation and completion

Запустить неизменённые mobile-shell unit tests, debug assemble обеих вариантов и применимые compile/lint checks.
Root full CI не запускать. Если безопасно доступен emulator — коротко подтвердить launcher start без fatal; это не
заменяет последующий независимый live-audit. Проверить diff на отсутствие test edits, weakened allowlist и
variant duplication.

Stage только явные mobile production paths, не `git add -A`; commit до конца хода, не push. Commit message включает
`#915`, точный crash, checks и remaining independent emulator recheck. Отчёт: SHA, файлы, команды, результат.
