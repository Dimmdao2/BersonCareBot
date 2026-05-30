# PROGRAM_ITEM_DISCUSSION_INITIATIVE

Инициатива по обсуждению элементов назначенной врачом программы реабилитации в кабинете пациента:
- thread по `instance_stage_item_id`;
- interim-ответ врача из журнала выполнения на странице программы;
- unread-индикаторы;
- загрузка фото/видео пациента для контроля специалистом.

## Статус

- Активная инициатива.
- Этап 0 (документация и контракты) выполнен.

## План исполнения

- Рабочий plan-файл Cursor (локальный путь): `/home/dev/.cursor/plans/program_item_discussion_070c3846.plan.md`

## Зафиксированные решения (P1-P24)

| ID | Решение |
|---|---|
| P1 | Фича только для `assignment_source === doctor`; promo/course вне scope. |
| P2 | В patient UX «ЛФК» трактуется как программа реабилитации, без возврата к UX-модели «комплексов». |
| P3 | `item.effectiveComment` в patient UI переименовывается в «Инструкция от специалиста». |
| P4 | Источник правды для thread UI: `program_item_discussion_messages`. |
| P5 | Ответ врача пишется и в discussion, и в общий support-чат (префикс канонизирован). |
| P6 | Комментарий пациента (`observation-note`) пишет и в `program_action_log`, и в discussion. |
| P7 | Interim webapp-ответ врача: клик по строке `patient_observation` в журнале. |
| P8 | Legacy admin-ответы без discussion-строки показываются через read-time merge по support-чату. |
| P9 | Backfill v1: перенос исторических `patient_observation` из `program_action_log` в discussion. |
| P10 | Per-item unread: отдельная таблица reads с `last_read_at`. |
| P11 | Общий чат-бейдж меняется с точки на красный кружок с цифрой. |
| P12 | «Отметить выполнение» -> модалка (difficulty/reps/weight), запись в payload `done`. |
| P13 | «В прошлый раз сделано ...» считается по последней `done` записи элемента. |
| P14 | Submission media: `usage_purpose=program_item_submission`, progressive 480p, без HLS, без playback stats. |
| P15 | Upload для пациента через новый scoped API, без расширения doctor-only `/api/media/upload`. |
| P16 | UI-копирайт лаконичный, без избыточных пояснений. |
| P17 | Новые интеграционные env не добавляются. |
| P18 | `POST .../progress/complete` остается backward-compatible (body опционален). |
| P19 | Reply pipeline идемпотентен по `integratorMessageId` / `support_message_id`. |
| P20 | `GET discussion` сразу с пагинацией и стабильной сортировкой; summary endpoint batch-only. |
| P21 | Новые doctor replies обязательно связываются `support_message_id -> discussion_message`; ambiguous legacy не автопривязывается. |
| P22 | Видео на patient pages воспроизводится через `PatientMediaPlaybackVideo` с progressive-only payload. |
| P23 | Rollout через `system_settings` feature-flags, default off. |
| P24 | В списках/превью пациента для видео — static thumb; playback в отдельном player view/модалке. |

Примечание по `P22` + `P24`: для списков/чата показывается только статичное превью, а воспроизведение открывается в отдельном player view/модалке через `PatientMediaPlaybackVideo`.

## Нормативные ссылки

- Правила исполнения инициативы: [`../RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`](../RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md)
- Модульная изоляция и thin routes: [`../../.cursor/rules/clean-architecture-module-isolation.mdc`](../../.cursor/rules/clean-architecture-module-isolation.mdc)
- Ответ врача на наблюдение пациента: [`../ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md)
- Patient media playback: [`../ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md`](../ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md)
