# Тест или взгляд

Это одноразовая живая приёмка уже приземлённой PWA identity surface, а не новый product stage. Проверяй M1-04 и
browser/PWA часть M7-03 взглядом на HTTP/HTML/manifest runtime из изолированного candidate server. Не пиши тесты
на строки, разметку, количество элементов или implementation calls: устойчивые manifest contracts уже покрыты
независимыми тестами `dccaef384` и `ce42f825f`. Product code не меняй.

## Authority и обязательное чтение

Кандидат — интеграционный HEAD, содержащий PWA landing `66ef65468`; taskdb `#915`. Сначала выполни
`grep -n "^## \|^### " AGENTS.md`, прочитай полностью global decision method, §1/§1a/§1b, §7, §9–§12,
§24 и `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`. Прочитай полный active plan M1 и M7, оба PWA audit
report, `surfaceLayoutMetadata`, manifest builders/routes и request-surface resolver до запуска среды. Используй
code-search до точного `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Брендированная пациентская
поверхность (`patient_branded`) НЕ переименовывается и НЕ переиконивается в Therapy Go». Вторая точная authority:
«Browser/PWA live acceptance покрывает install metadata обеих поверхностей, брендированную поверхность §M1-04,
file fallback и iframe Jitsi». Этот проход закрывает только install metadata/брендированную часть; file fallback
и iframe Jitsi честно оставить M7-03 open до последующих web-runtime/media этапов.

## Живой проход

Работай только с именованной DEV `bcb_webapp_dev`, read-only на уровне продукта: никаких seed/reset/refresh,
миграций, записей в БД, внешней доставки, TEST/PROD или чтения/печати секретов. Не трогай общий порт 5200 и не
зови `pnpm dev*` wrappers, которые убивают чужой сервер. Запусти candidate напрямую из `apps/webapp` на одном
свободном порту 5210–5219 по §3b, с явным timeout/readiness loop и логом вне Git; после проверки гарантированно
останови только свой PID/process group. Не заканчивай ход, пока сервер работает или foreground-команда не завершена.

Через реальный HTTP/HTML runtime, не вызовом builder-функции напрямую, докажи:

1. default patient Host отдаёт Therapy Go title/manifest/apple-touch и manifest с `id=/app`, `scope=/app`,
   `start_url=/app/patient`, Therapy Go 192/512 + отдельным maskable;
2. staff Host отдаёт Therapysto metadata и отдельный staff manifest с `start_url=/app/doctor`, без Therapy Go;
3. platform-admin Host не объявляет patient/staff manifest/apple-web-app/icons, а оба PWA manifest route на этой
   surface не выдают устанавливаемую admin PWA;
4. реально опубликованный branded patient Host именованной DEV (найди только через существующий публичный
   resolver/application behavior; ожидаемый кандидат из актуальной domain map — `app.bersoncare.ru`, но не считай
   его фактом без runtime ответа) сохраняет effective clinic name и legacy clinic icons, не содержит Therapy Go и
   не рекламирует несуществующий maskable;
5. patient/staff install URLs и совместимый doctor redirect отвечают ожидаемой surface без `/setup`; не проверяй
   изменчивый текст или раскладку.

Для каждого пункта запиши exact command/URL/Host, HTTP status и наблюдаемые metadata/manifest поля. Если DEV не
содержит опубликованного branded binding или runtime нельзя поднять без запрещённого действия, вердикт по M1-04 —
BLOCKED с точным доказательством, а не симуляция и не product fix. Любая проблема вне этих пунктов — owner question,
не задача.

## Результат

Создай только `.lead/runs/mobile-pwa-live-acceptance-20260909/90-final-audit-report.md`. Не коммить screenshots,
logs, cookies или credentials. Вердикт бинарный по каждому из пяти пунктов и явно перечисляет, какая часть M7-03
остаётся открытой. Если применимой автоматизируемой fault injection здесь нет, напиши `убито 0 / непойманных 0`
и объясни, что это one-time live inspection; не изобретай тест на обстоятельства запуска. Выполни `git diff --check`,
застейджи только report явным путём, закоммить с `#915`, SHA кандидата, evidence и blockers. Не пушить.
