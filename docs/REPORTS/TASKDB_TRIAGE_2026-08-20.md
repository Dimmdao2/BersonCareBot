# Триаж открытых taskdb-карточек — 2026-08-20

Срез: `node /home/dev/brain/tools/taskdb.mjs list bcb | rg '^#[0-9]+ \\{bcb\\} \\[(todo|doing|blocked)\\]'` — 55 карточек. `done` исключены.

Для каждой темы сначала выполнен `node /home/dev/brain/tools/code-search.mjs "<суть>" --repo bcb -k 3`; затем сверены указанный план и история затронутых путей. Например, запросы `протоколы осмотра WYSIWYG`, `lifecycle seals patient organization resolver`, `Security CI Gitleaks Semgrep Trivy ZAP`, `email OTP global admin PWA web push`, `global admin channel auth toggles mini app`, `media transcode jobs worker control`, `DoctorTimezoneSection branch timezone`, `hosting video preview YouTube VK`. Наличие планового текста или частичного коммита не считалось готовностью.

## ДУБЛЬ

| # | заголовок | статус сейчас | корзина | доказательство | блокирует запуск? |
| --- | --- | --- | --- | --- | --- |
| 201 | B2.8: протоколы осмотра | blocked | ДУБЛЬ | Тот же справочник, подбор и форма, что в #513; единственный более детальный scope — #513. `code-search "протоколы осмотра WYSIWYG" --repo bcb` вернул только backlog/архив, реализации нет. | — |
| 1084 | Система доступа к БД v3 | doing | ДУБЛЬ | Тот же `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`, те же Ф8 и четыре runtime-логина, что в #1085. Работу продолжать по #1085. | — |

## ЖДЁТ ВЛАДЕЛЬЦА

| # | заголовок | статус сейчас | корзина | доказательство | блокирует запуск? |
| --- | --- | --- | --- | --- | --- |
| 796 | U5A: контекст организации пациента и lifecycle seals | blocked | ЖДЁТ ВЛАДЕЛЬЦА | В roadmap principal-баг закрыт; lifecycle seals отложены до проработки экранов пациента. | — |
| 805 | Public booking TEST-приёмка | todo | ЖДЁТ ВЛАДЕЛЬЦА | В карточке открыт вопрос: можно ли создать запись на уже развёрнутом TEST. | — |
| 807 | Public routing | todo | ЖДЁТ ВЛАДЕЛЬЦА | Карточка требует product/UX/security design и owner acceptance; `auto_ok=false`. | — |
| 843 | Clinic mode: доплата за места | todo | ЖДЁТ ВЛАДЕЛЬЦА | Прямо зависит от ещё не выбранного billing-контракта. | — |
| 854 | Platform analytics | todo | ЖДЁТ ВЛАДЕЛЬЦА | Формулы и источник billing-метрик должны быть определены владельцем; `auto_ok=false`. | — |
| 881 | Security CI stack | blocked | ЖДЁТ ВЛАДЕЛЬЦА | Кодовые Gitleaks/self-test/Semgrep/Trivy уже PASS; остаются регистрация workflow в default branch и TEST runner/firewall для ZAP. | — |
| 914 | LOG-01 sensitive payload hygiene | todo | ЖДЁТ ВЛАДЕЛЬЦА | L2 разрешён только после точного manifest/G-03; `auto_ok=false`. | — |
| 915 | Native mobile app | todo | ЖДЁТ ВЛАДЕЛЬЦА | MOB-00 ADR/spike и последующие owner-gates ещё не даны. | — |
| 922 | Голосовые сообщения | todo | ЖДЁТ ВЛАДЕЛЬЦА | Явно отложено владельцем на post-production; начинать без owner-go запрещено. | — |
| 926 | U6B public page/widgets | todo | ЖДЁТ ВЛАДЕЛЬЦА | Высокорисковый этап только после текущей волны и owner readiness audit. | — |
| 964 | UI-7a scheduled messages | todo | ЖДЁТ ВЛАДЕЛЬЦА | Незакрытый вопрос карточки о едином блоке запланированных сообщений. | — |
| 1005 | Политика входа и 2FA | blocked | ЖДЁТ ВЛАДЕЛЬЦА | `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md`: политика входа остаётся owner decision. | — |
| 1010 | Ротация скомпрометированного SMS-ключа | blocked | ЖДЁТ ВЛАДЕЛЬЦА | Требуется решение о безопасной ротации; значения секретов не читались и в отчёт не попали. | — |
| 1026 | DEV-пароли БД в tool-log | blocked | ЖДЁТ ВЛАДЕЛЬЦА | В карточке точный вопрос о DEV-only окне и wrapper; TEST/PROD исключены. | — |
| 1028 | Scope ролей расписания клиники | blocked | ЖДЁТ ВЛАДЕЛЬЦА | План `CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` зависит от границ ролей, которые задаёт владелец. | — |
| 1035 | RU privacy: вопросы юристу | blocked | ЖДЁТ ВЛАДЕЛЬЦА | Карточка фиксирует три внешних вопроса юристу. | — |
| 1042 | Новый production host | todo | ЖДЁТ ВЛАДЕЛЬЦА | Требуются два решения: FIO-backfill и historical Gitleaks ignore; прод не трогался. | — |
| 1044 | TEST-аккаунты clinic_admin и doctor | todo | ЖДЁТ ВЛАДЕЛЬЦА | Владелец должен показать требуемые различия ролей; их нельзя изобретать. | — |
| 1062 | Направленный поиск скрытых ошибок | blocked | ЖДЁТ ВЛАДЕЛЬЦА | Поиск уже проведён по прямому вопросу владельца; дальнейшая работа — выбор по найденным случаям. | — |
| 1069 | Квоты тарифов | doing | ЖДЁТ ВЛАДЕЛЬЦА | В #1069 закрыты T1/T2/T7/T9/T10 и TEST ladder; остаётся owner UI walkthrough/ответ по legacy `directPublic`. | — |
| 1089 | Глубокий аудит кода | todo | ЖДЁТ ВЛАДЕЛЬЦА | Третий вопрос аудита и момент запуска оставлены владельцем за собой. | — |

## ЖИВАЯ, В РАБОТЕ

| # | заголовок | статус сейчас | корзина | доказательство | блокирует запуск? |
| --- | --- | --- | --- | --- | --- |
| 984 | UI finish + re-audit + TEST access | doing | ЖИВАЯ, В РАБОТЕ | `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`: три активных трека; не завершены live-acceptance/TEST части. | да |
| 987 | Integrator → public cleanup | doing | ЖИВАЯ, В РАБОТЕ | Карточка фиксирует закрытые D15b/5–6 (коммиты `6da6759a3..123029848`), но хвост этапа открыт. | да |
| 993 | Global-admin channel/auth toggles | doing | ЖИВАЯ, В РАБОТЕ | `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md` содержит активную спецификацию; code-search подтверждает, что mini-app removal — часть незавершённого workstream. | да |
| 996 | Prod cutover runbook/rehearsal | doing | ЖИВАЯ, В РАБОТЕ | В карточке остаются закрытие blocked steps и fresh-dump rehearsal. | да |
| 998 | Smoke-гейт живых клиник | blocked | ЖИВАЯ, В РАБОТЕ | Статус blocked; требуется перевести smoke на живые клиники без падения TEST-служб. | да |
| 1063 | Регистрация владельца без профиля специалиста | doing | ЖИВАЯ, В РАБОТЕ | Карточка описывает незакрытый разрыв регистрации; связанная U3S-приёмка ещё не состоялась. | да |
| 1071 | Platform/clinic integrations | doing | ЖИВАЯ, В РАБОТЕ | Уже сделано `a1d74e46c` (Google Calendar убран из platform UI); остаются реестр, clinic credentials, VK ID и Яндекс-календарь. | нет |
| 1081 | Пустота в тестах | doing | ЖИВАЯ, В РАБОТЕ | `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`: механика, webapp и integrator ещё не доведены. | нет |
| 1082 | Single-entry cleanup | doing | ЖИВАЯ, В РАБОТЕ | `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`: единые двери и механические гейты ещё строятся. | да |
| 1085 | DB privilege layer rebuild | doing | ЖИВАЯ, В РАБОТЕ | DEV/Four-login и health уже готовы; Ф8 ждёт owner-approved cleanup, затем TEST reset/migrate/reconcile. | да |
| 1090 | Media worker root | doing | ЖИВАЯ, В РАБОТЕ | `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`: найдено 484 отказа воркера; ветка `wt/media-worker-root-20260819`, остаётся repair/проверка. | да |
| 1091 | Rule §34 timezone | doing | ЖИВАЯ, В РАБОТЕ | Тот же план: controls у человека ещё снимаются, branch field ещё добавляется в UI. | нет |

## ЖИВАЯ, НЕ НАЧАТА

| # | заголовок | статус сейчас | корзина | доказательство | блокирует запуск? |
| --- | --- | --- | --- | --- | --- |
| 90 | Рассылки: schedule/topics/subscriptions | todo | ЖИВАЯ, НЕ НАЧАТА | `code-search` по теме не нашёл реализации новых topic/scheduled моделей; в карточке это большой будущий этап. | нет |
| 190 | B1.5 reminder presets | todo | ЖИВАЯ, НЕ НАЧАТА | Карточка описывает текущие интервальные напоминания как исходное состояние; реализации preset нет. | нет |
| 209 | Центр уведомлений/новостей | todo | ЖИВАЯ, НЕ НАЧАТА | Карточка требует перенос рассылок и новый unread feed; новой поверхности в коде не найдено. | нет |
| 213 | Marketing opt-in | todo | ЖИВАЯ, НЕ НАЧАТА | Новая часть модели topics #90; собственных полей/flow нет. | нет |
| 215 | Booking flow онлайн-приёма | todo | ЖИВАЯ, НЕ НАЧАТА | Отдельно от базового #197 и требует предоплаты/выборочного приёма. | да |
| 808 | Global-admin baseline | todo | ЖИВАЯ, НЕ НАЧАТА | Реализация support chat и минимальной console ещё не начата: карточка требует сначала короткую design note и отдельный admin chokepoint. | нет |
| 513 | Протоколы осмотра + WYSIWYG | todo | ЖИВАЯ, НЕ НАЧАТА | Поиск вернул backlog/архив, не implementation; #201 сведён сюда как дубль. | нет |
| 898 | RU privacy master | todo | ЖИВАЯ, НЕ НАЧАТА | Master DAG жив: PR-02 #907 todo, широкий PR-03 ждёт его. | да |
| 917 | U3S owner handoff | todo | ЖИВАЯ, НЕ НАЧАТА | Допустим только после реальной TEST-приёмки регистрации; она ещё не доказана. | да |
| 935 | Pre-production hardening | todo | ЖИВАЯ, НЕ НАЧАТА | Предписан старт с reconciliation #770/#797/#933/#934/#881; его нет в evidence карточки. | да |
| 971 | UI-5b client-card completeness | todo | ЖИВАЯ, НЕ НАЧАТА | Authority требует сначала census/current-gap manifest; завершённого этапа нет. | нет |
| 985 | TEST email-OTP/PWA/web-push | todo | ЖИВАЯ, НЕ НАЧАТА | Track B handoff существует, но карточка требует ещё DB binding, TEST proof и login steps. | да |
| 1001 | Глубокий реаудит безопасности | todo | ЖИВАЯ, НЕ НАЧАТА | Карточка перечисляет неаудированные S4–S6/host; решения по всем находкам ещё не подготовлены. | да |
| 1014 | Уязвимость brace-expansion в CI | blocked | ЖИВАЯ, НЕ НАЧАТА | Блокер внешний: единственный потребитель — ESLint/minimatch, рабочей правки нет; #934 закрывал иной dependency milestone. | нет |
| 1031 | Решения владельца 26.07 | todo | ЖИВАЯ, НЕ НАЧАТА | Карточка остаётся набором решений без отдельного evidence реализованного workstream. | нет |
| 1070 | Support tickets | blocked | ЖИВАЯ, НЕ НАЧАТА | `docs/_TODO/SUPPORT_TICKETS_1070.md`: DB/RLS реализация ждёт security gate. | нет |
| 1086 | Post-production identity/contact model | todo | ЖИВАЯ, НЕ НАЧАТА | План прямо помещает cutover после production. | нет |
| 1087 | Telegram/MAX menu | todo | ЖИВАЯ, НЕ НАЧАТА | `docs/_TODO/TELEGRAM_MAX_MINIAPP_AND_MENU_2026-08-19.md`: нужна разведка текущей настройки и product decision. | нет |
| 1088 | Silent-error/retention sweep | todo | ЖИВАЯ, НЕ НАЧАТА | План фиксирует случаи и будущий полный поиск/замеры, а не готовую реализацию. | да |
| 1092 | Hosted video preview | todo | ЖИВАЯ, НЕ НАЧАТА | `hostingEmbedUrls.ts` уже разбирает URL, но конвейер `getPreview` для hosted_video отсутствует; требуются YouTube/VK branches. | нет |

## УЖЕ СДЕЛАНО

Нет. Ни одна открытая карточка не имеет одновременно завершённого объёма и file+commit evidence, достаточного для закрытия. Частично сделанные #881, #1069 и #1071 оставлены в соответствующих корзинах, поскольку в самих карточках названы незакрытые условия.

## Итоговые числа

| корзина | количество |
| --- | ---: |
| УЖЕ СДЕЛАНО | 0 |
| ПРОТУХЛА | 0 |
| ДУБЛЬ | 2 |
| ЖИВАЯ, НЕ НАЧАТА | 20 |
| ЖИВАЯ, В РАБОТЕ | 12 |
| ЖДЁТ ВЛАДЕЛЬЦА | 21 |
| **Всего** | **55** |
