# Blind kill-set — canonical HLS delivery cleanup (fabf99e60)

Составлен ДО чтения тестов кандидата, только из authority
(`docs/_TODO/runs/media-hls-cleanup/WORKER_BRIEF.md`, решение владельца 04.09.2026) и из архитектуры
playback до правки. Каждый пункт — достижимый сценарий, который должен КРАСНЕТЬ, если правка неверна.

## A. Маршрут выдачи (обязательный результат §1, §4)

- K01 HLS-ready каталожное видео всё ещё отдаёт progressive/mp4 URL в payload → плеер уходит на
  удалённый `s3_key` (исходная проблема не решена).
- K02 Плеер при fatal HLS error переключается на progressive источник (любая ветвь, включая
  `onError` нативного `<video>`), вместо штатной ошибки.
- K03 Видео БЕЗ готового HLS (`hls_master_playlist_s3_key IS NULL`) теряет progressive путь →
  до-HLS каталог неиграбелен.
- K04 `usage_purpose='program_item_submission'` теряет progressive путь → видео пациента неиграбельно.
- K05 Не-видео медиа (изображение/pdf/аудио) теряет delivery 'file' / progressive URL.
- K06 Маршрут по-прежнему зависит от настройки/override, а не от строки медиа (остался configurable
  fallback под другим именем).

## B. Мёртвые consumer-ы (обязательный результат §2, §3, §5)

- K07 Живой consumer `video_default_delivery` (registry, runtimeConfig, PATCH-валидация, admin UI,
  подписи селектора) остался → настройка удалена из БД, код читает отсутствующий ключ.
- K08 Живой consumer `video_delivery_override` (schema.ts, репозитории, SQL функций) остался →
  колонка снята, запрос падает.
- K09 `?prefer=mp4|hls|auto` всё ещё принимается/влияет на GET `/api/media/[id]/playback`.
- K10 `fallbackUsed` / legacy `mp4` поле payload осталось живым (тип, продюсер или потребитель).
- K11 Fallback-счётчики (`fallback_used`, `fallback_count`, `fallbackTotal`, `fallbackTotalLast1h`)
  остались в сборе/отображении.
- K12 Сравнивающая HLS-vs-MP4/file аналитика осталась (`byDelivery` в системном здоровье, пирог
  «Формат доставки», таблица ReminderStats, `hlsResolves`/`mp4Resolves` в платформенном дашборде).
- K13 Historical/archive evidence ошибочно засчитан как живой consumer (обратная ошибка: снесена
  история/принятые audit records).

## C. Сохранённая телеметрия (обязательный результат §3, запрет брифа)

- K14 `media_hls_proxy_error_events` или HLS proxy/error diagnostics удалены.
- K15 `media_playback_client_events` (client error telemetry) удалена.
- K16 Телеметрия сохранена по имени, но переименована/схлопнута в ложную ОБЩУЮ метрику, которая
  больше не различает HLS-ошибку.
- K17 Колонка `delivery` (что фактически отдали, часть ключа почасового агрегата) удалена или
  сломана как ключ агрегации.

## D. Chokepoint (обязательный результат §6)

- K18 Появился второй playback resolver или второй плеер/абстракция вместо расширения
  `modules/media/playbackResolveDelivery` + существующих двух плееров.
- K19 `sourceKind` перестал быть производным и снова конфигурируется извне.

## E. Миграция и права (§1, обязательный результат §2)

- K20 Миграция дропает колонку/строку, на которую ещё ссылается живой SQL (тело функции, репозиторий,
  `schema.ts`) → runtime после apply.
- K21 Функция сменила signature/arity, но старая перегрузка осталась (лишний OID) → ambiguous
  function, повисшие GRANT на старый OID.
- K22 Переписанное тело функции меняет owner/SECURITY-режим или фактические SELECT/INSERT/UPDATE/
  DELETE/lock относительно declaration.
- K23 Runtime `EXECUTE`/динамический SQL внутри функции ссылается на снятую колонку.
- K24 В миграции есть GRANT/REVOKE/ROLE/POLICY (запрещено §1).
- K25 Declaration / function-census / relation-access не обновлены → declaration completeness провален.
- K26 Сгенерированные артефакты (`privileges.*.sql`, `port-context-capabilities.*.sql`) не совпадают
  побайтно с declaration.
- K27 Rollback-only preflight на именованной DEV падает (owner-aware проверка кандидата после
  integration merge).

## F. Пересечение с принятыми коммитами (§8 миссии)

- K28 Merge `77abd6e77` сломал уже принятые payment/toast/appointment/UI изменения.
- K29 Media player потерял принятую чёрную safe-area рамку / расположение close control.

## G. Тестовая политика (§10a/§10b)

- K30 Добавлены тесты на literal UI-текст, наличие/форму кнопки, count/layout/исходные строки.
- K31 Существующие вредные shape-тесты расширены.
