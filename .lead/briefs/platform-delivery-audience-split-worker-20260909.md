# Worker brief — #787 platform delivery split by audience

Источник оракула — `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5 и строки
`TPB-12a`, `TPB-12b`, `TPB-13a`, `C3`, `C4` в редакции owner 09.09.2026. Цитата: «Для специалистов используются
платформенные SMTP, Telegram-бот и MAX-бот Therapysto; для пациентов — отдельные платформенные SMTP,
Telegram-бот и MAX-бот TherapyGo».

## Authority and rules

Реализовать одним цельным проходом audience-aware платформенные credentials для email, Telegram и MAX на exact
`feat/doctor-ui-rebuild` base, выданном портом. Перед каждым действием выполнять heading-map gate `AGENTS.md`.
Прочитать `README.md`, `AGENTS.md` §1 migration/privilege subsections, §2–§5, §9, §10a, §10b, §12, §24, канон конфигурации интеграций, указанные строки
плана и текущие email/bot dispatch/config/settings flows. Сначала `code-search`, затем точный `rg`.

Worker не пишет тесты: не добавлять, не менять, не удалять, не переименовывать и не ослаблять test/audit files.
Запускать существующие проверки неизменными. Не трогать PROD/TEST/DEV DB, реальные provider credentials,
миграции живых БД, deploy, mobile-shell, PWA/Jitsi, custom-domain работу, lockfile и чужой UI. Если restricted
DB read capability нельзя безопасно параметризовать без forward-only migration, создать её только каноническим
repo-механизмом и дать обязательный разбор прав; не применять на базе.

## Required product result

- Параметризовать существующие единые choke points, не создавать параллельные mailer/dispatcher/config stores.
  Обязательно применить §5: вариант аудитории — параметр существующей точки. Кандидаты на расширение:
  `resolveSmtpOutboundConfig`, existing mail delivery adapter, `integrationRuntimeConfig` и существующий
  `dispatchPort`/delivery routing.
- В DB-backed `system_settings` добавить явные restricted platform credentials для TherapyGo и Therapysto:
  SMTP transport/From, Telegram token/config и MAX key/config. Секреты не хранить в env и не проецировать наружу.
  Existing per-org `clinic_smtp_outbound`, `clinic_telegram_bot_token`, `clinic_max_bot_api_key` сохранить без
  дублирования и только для patient-facing clinic override.
- Единственный typed audience/surface selector обязан выбрать: staff → Therapysto; standard patient → TherapyGo;
  branded patient → проверенный clinic override, иначе TherapyGo. Ни один caller не выбирает ключ credential
  строкой вручную. Отсутствующий новый credential не должен молча отправлять через чужой бренд.
- Существующий admin Settings flow должен позволять независимо вводить обе платформенные конфигурации каждого
  канала с текущей redaction/secret-envelope моделью. Не копировать отдельные формы, если текущий компонент можно
  параметризовать.
- Подключить staff operational intents, которые уже существуют в домене и dispatch path (как минимум новая запись,
  перенос/отмена, сообщение пациента), к Therapysto Telegram/MAX как дополнительным каналам к push. Не изобретать
  новые события и не расширять продуктовую семантику за перечисленные существующие intents.
- Сохранить patient confirmation/recovery/security/notification через TherapyGo Telegram/MAX и clinic override;
  mass mailing и SMS не менять.
- Backward compatibility старых ключей исследовать по фактическим consumers. Не объявлять legacy credential
  Therapysto или TherapyGo догадкой. Если безопасное автоматическое соответствие не доказано owner-текстом или
  runtime metadata, оставить явный fail-closed migration note/операторский cutover, а не перекрёстный fallback.

## Validation and completion

Запустить неизменённые targeted tests по settings redaction/config resolution/email delivery/dispatch и typecheck
обоих приложений, scoped lint/format для изменённых файлов. Root full CI не запускать. Проверить diff: один selector,
нет `any`, новых env, plaintext secret, duplicate dispatcher/mailer, test edits и unrelated changes.

Stage только явные production/docs paths, не `git add -A`; закоммитить всё своё до конца хода, не push. Commit
message включает `#787`, причину, checks и честно перечисляет live/provider/credential остаток. В отчёте дать SHA,
файлы, команды и отдельно назвать любые существующие staff intents, которых в текущем dispatch domain реально нет;
их не выдумывать.
