# Agent log — preview runtime hardening (2026-04-16)

## Диагностика

- В production-логах preview-воркера подтверждены два ключевых класса сбоев: `ffmpeg was killed with signal SIGSEGV` и ошибки HEIF codec (`compression format has not been built in`).
- Форматы `image/heic` / `image/heif` могли зависать в `pending`, потому что текущий runtime `sharp` на хосте не поддерживает `libheif`.
- Для production нужно использовать системный ffmpeg и явный `FFMPEG_PATH`, иначе fallback на бинарь из `@ffmpeg-installer` нестабилен для хоста.
- Cron для media preview должен работать по loopback и `INTERNAL_JOB_SECRET` через `POST /api/internal/media-preview/process`.

## Сделано

- Код: в `env` добавлен `FFMPEG_PATH` (схема + parsed + тестовый baseline).
- Код: `mediaPreviewWorker` теперь выбирает ffmpeg как `env.FFMPEG_PATH || ffmpegInstaller.path` и логирует выбранный путь.
- Код: добавлен guard для `image/heic` / `image/heif` с немедленным переводом в `skipped`.
- Код: добавлен `isPermanentPreviewError` для неретрабельных ошибок (`SIGSEGV`, codec/input format), такие строки теперь переводятся в `skipped` без backoff.
- Тесты: создан `apps/webapp/src/infra/repos/mediaPreviewWorker.test.ts` (ffmpeg path policy, heic/heif skip, permanent vs transient error handling).
- Доки: обновлены `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, `docs/MEDIA_PREVIEW_PIPELINE.md` (FFMPEG_PATH, ограничения HEIC/HEIF, troubleshooting SIGSEGV, матрица форматов).

## Чеклист для оператора (production)

- [ ] Установлен системный `ffmpeg` и доступен как `/usr/bin/ffmpeg`.
- [ ] В `/opt/env/bersoncarebot/webapp.prod` задано `FFMPEG_PATH=/usr/bin/ffmpeg`.
- [ ] Установлен и активен cron `/etc/cron.d/bersoncarebot-media-preview` с loopback-вызовом preview endpoint.
- [ ] HEIC/HEIF из очереди `pending` переведены в `skipped` (разово SQL-операцией и/или новым кодом после деплоя).
- [ ] После деплоя и backfill в `media_files` есть `ready` с заполненным `preview_sm_key`, `pending` снижается.
