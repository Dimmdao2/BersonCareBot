# Тест или взгляд — #915 branded patient PWA closure

Это один цельный live-аудит разового поведения на именованном DEV. Production-код и постоянные тесты не менять.

## Authority

- Прочитать карту заголовков `AGENTS.md`, затем полностью §1, §1a, §1b, §5, §9, §10, §10a, §10b, §12 и §24.
- Прочитать `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` и `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` §1, M1-04, M7-03, §6 и evidence ledger.
- Точный owner-критерий M1-04: «Брендированная пациентская поверхность (`patient_branded`) НЕ переименовывается и НЕ переиконивается в TherapyGo: имя по-прежнему берётся из `effectivePatientBrand.patientAppName`, а знак TherapyGo остаётся идентичностью `patient_default`».
- Точный live-критерий M1-04: «Доказательство — снимок метаданных обеих поверхностей на именованном DEV».

## Предмет и границы

Проверить exact candidate SHA текущего worktree. Сначала `code-search`, затем существующие surface/domain/application ports. Не использовать сырой SQL, не создавать БД, не проигрывать historical migrations, не трогать TEST/PROD и не читать/печатать секреты. Вход — только штатными owner DEV-учётками по §1a.

Найти repo-compliant пользовательский или application-port путь, позволяющий на именованном DEV наблюдать одновременно:

1. `patient_default`: TherapyGo + patient-default manifest/apple-touch/app icons;
2. `patient_branded`: фактическое clinic name из `effectivePatientBrand.patientAppName` и clinic-specific/legacy brand assets, но не TherapyGo icons;
3. после проверки не остаётся persistent fixture/domain binding/изменённого brand state.

Обычный reversible пользовательский create→observe→delete допустим только для уже зарегистрированной owner-клиники и только если существующий продуктовый путь гарантирует очистку. Rollback-only probe допустим только через существующий application/Drizzle boundary и должен доказать rollback. Нельзя добавлять ad-hoc SQL/script/route или подменять runtime снимок unit-вызовом. Если published host/DNS действительно необходим и его нет, доказать это точными путями/командами и найти максимум наблюдаемого поведения без выдумывания данных.

Проверка разовая: новых тестов, source-shape assertions и fault injection не писать. Код продукта не исправлять. Реальный дефект оформить finding с достижимым сценарием и точным нарушенным требованием; дальше остановиться.

## Результат

- Единственный разрешённый файл: `.lead/runs/mobile-branded-pwa-closure-20260909/90-final-audit-report.md`.
- В отчёте: exact SHA, команды/публичные URL без секретов, обычный вход, снимки/headers/metadata обеих поверхностей, доказательство очистки, бинарный verdict M1-04 и относящейся части M7-03.
- Если blocker остаётся, назвать одно конкретное внешнее условие, а не общую «среду».
- Остановить только свои процессы, удалить временные browser profiles/cookies/logs; не трогать общий 5200.
- Закоммитить только audit-artifact явным staging, не push. Не завершать ход в ожидании фонового процесса.

убито 0 / непойманных 0 — это live view, не новый поведенческий test suite.
