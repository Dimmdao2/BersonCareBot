# Тест или взгляд — pre-land code acceptance активного браузерного звонка #915

Ты независимый аудитор exact candidate текущей ветки, где product correction — `6cbcc8cbb`. Сначала прочитай карту
`AGENTS.md`, затем целиком §10a, §10b, §15–§17 и §24. Authority: owner-решения и чек-лист
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, предыдущие отчёты
`.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md` и
`.lead/runs/mobile-active-call-nav-fix-audit-20260909/90-final-audit-report.md`.

Это только независимая pre-land code/build-приёмка. Не запускай Next ни на каком порту и не трогай общий Turbopack
`:5200`: live-путь будет проверен после landing на единственном общем DEV-сервере.

До чтения тестов классифицируй пункты как «тест или взгляд». Проверь exact diff `6cbcc8cbb` и его интеграционные
границы: на мобильном активный iframe не перекрывает верхнюю и нижнюю навигацию; desktop layout не получает новый
плавающий control; уход по внутреннему маршруту не завершает вызов; существующий coordinator сохраняет одну сессию,
показывает явный возврат и блокирует второй старт; завершение остаётся только явным terminal action. Проверь, что
исправление расширяет существующий путь, не создаёт второй coordinator/Jitsi renderer.

Автоматизированные UI-тесты запрещены. Не создавать и не сохранять тесты на DOM, labels, counts, CSS/source shape.
Переиспользуй только допустимые существующие не-UI behavior gates и typecheck/lint/build-check по минимальному scope.
Временные изменения полностью откати. Продуктовый fix не делай.

Итог: PASS либо конкретный reachable MUST FIX; обнови audit-artifact и audit queue, закоммить только отчётные
артефакты. Долгие команды выполняй на переднем плане и дождись завершения.
