# Тест или взгляд

Это один разовый live/browser integration-аудит итогового committed SHA. Production-код и существующие тесты read-only; аудитор создаёт только итоговый audit-artifact. Повторно доказывать уже принятые неизменённые поверхности запрещено.

## Authority

- `AGENTS.md`: до каждого действия карта заголовков; полностью прочитать §1, §1a, §1b, §9, §10, §10a, §10b, §11, §12 и §24.
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` — единственный канон локального live-запуска, изолированного порта и обычного входа.
- `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: актуальные §M1, §M4, §M5 и §M7.
- Точный критерий §M7-03: «Оба TEST APK variants собираются на Linux (зависит от `M2-00`). Browser/PWA live acceptance покрывает install metadata обеих поверхностей, брендированную поверхность §M1-04, file fallback и iframe Jitsi — это выполнимо в репозитории и на именованном DEV/TEST без внешних гейтов».
- Owner-коррекция §1.1: patient display name — `TherapyGo`, одним словом с заглавной `G`; технические идентификаторы `therapygo` не меняются.
- Owner-коррекция §1.8/M4-02/M4-04: уход со страницы или сворачивание приложения не завершает нативный звонок;
  Android продолжает его в Picture-in-Picture, и только явная кнопка «Завершить звонок» завершает конференцию.
- Owner-коррекция §1.9/M4-04/M4-06: mobile browser/PWA сохраняет тот же звонок при внутренних переходах; на других
  страницах есть зональный индикатор возврата, а обычные start-call controls не позволяют начать второй звонок.
  Десктопная раскладка не перерабатывается.
- Принятый PWA live-отчёт `.lead/runs/mobile-pwa-live-bootstrap-recheck-20260909/90-final-audit-report.md` (report commit `ee0c91fc8`).
- Принятый browser Jitsi live-отчёт `docs/audit/video-live-ui-final-verification-2026-09-08.md`.
- Принятые итоговые отчёты и evidence DeviceMedia correction и исправленного NativeJitsi web-seam на проверяемом integrated SHA.

## Предмет

Проверяется точный committed candidate, созданный от актуального `feat/doctor-ui-rebuild` после landing DeviceMedia correction и NativeJitsi web-seam. До проверки записать полный SHA. Не вливать в candidate более свежий `feat` после фиксации предмета.

## Strong reuse gate

1. Сначала сравнить затронутые пути и зафиксировать решение о reuse.
2. Старое PWA metadata evidence `ee0c91fc8` не доказывает исправленное написание. Для точного `TherapyGo` переиспользовать новый принятый naming-audit только если после него не менялись относящиеся к metadata/manifest/branding/install-surface файлы; остальное неизменённое PWA evidence можно переиспользовать отдельно.
3. Старое APK badging evidence не доказывает исправленный label. Переиспользовать новый naming-audit Linux build/`aapt dump badging` только если после его SHA не менялись `apps/mobile-shell/**`, workspace dependency manifests и lockfile. Если менялись — обе TEST APK собрать только через host lock из `AGENTS.md` и повторить badging-проверку.
4. Не повторять уже доказанные metadata/Gradle проверки, если релевантный код неизменен. В отчёте назвать точные использованные SHA/команды/артефакты.

## Live browser acceptance

Запустить candidate по канону на свободном изолированном порту из диапазона `5210–5219`. Допустима только ссылка на штатный `.env` по канону; секреты не читать и не печатать. Входить обычными owner DEV-учётками. Не занимать общий `5200`, не трогать PROD, не запускать provider delivery, миграции или реальные upload side effects.

### File fallback

- Доказать, что обычный browser/PWA runtime не определяется как нативный Capacitor runtime и не вызывает `DeviceMedia`.
- На достижимых patient и doctor/CMS поверхностях вызвать пользовательские действия камеры/галереи/документа и подтвердить фактическое browser file chooser поведение. Chooser отменить: upload и DB mutation не выполнять.
- Минимум: patient camera/gallery/document и одна достижимая doctor/CMS upload-source поверхность.
- Отдельно инспекцией итогового diff/кода сопоставить все шесть production file inputs/source paths с требуемыми `accept`/`capture` и browser fallback. Это проверка итогового состояния, не тест на строки исходника.
- Если live-поверхность недостижима из-за отсутствующих штатных DEV-данных, назвать точный blocker и использовать сохранённый поведенческий oracle/принятый audit для этого пункта; не создавать фиктивные записи и не подменять live утверждением по коду.

### Browser iframe Jitsi

- На итоговом integrated SHA обычным doctor/patient путём явно начать встречу и доказать, что browser path создаёт ровно один iframe существующего renderer, использует только self-hosted Jitsi endpoint и не вызывает `NativeJitsi`.
- Использовать synthetic media по локальному канону. Не запрашивать реальную камеру/микрофон хоста.
- Сделать разовый forced first-script failure: интерфейс обязан показать штатный retry, после retry должен существовать ровно один iframe.
- Можно переиспользовать штатные DEV-данные и путь из #1100; не создавать обходной тестовый UI и не принимать прямой вызов функции вместо пользовательского пути.
- На mobile viewport начать звонок, перейти внутренней навигацией в карточку/программу и доказать, что iframe не
  пересоздан и конференция не завершена; на другой странице виден patient/doctor-зональный индикатор с доступным
  действием возврата на точный call URL, а start-call controls не запускают второй звонок. После возврата это тот же
  звонок; только явное завершение очищает индикатор и вызывает существующий terminal callback один раз.
- На desktop viewport подтвердить отсутствие нового floating UI и сохранение прежней раскладки; redesign не делать.

## Граница finding

Finding существует только для достижимого нарушения §M7-03/owner requirement, обязательного repo-rule либо реальной build/runtime/integration regression с impact и evidence. Стиль, альтернативная архитектура, теоретическое hardening и отсутствие внешних ресурсов не finding. Внешние ограничения §M1-04, §M7-04 и §M7-05 фиксируются как blockers, если к моменту проверки всё ещё отсутствуют published branded DEV host, физическое устройство/эмулятор с KVM или owner RuStore signing credentials.

## Результат

- Единственный новый файл: `.lead/runs/mobile-final-integrated-browser-acceptance-20260909/90-final-audit-report.md`.
- Указать candidate SHA, точные команды и порты, reused evidence с проверкой неизменности путей, бинарный результат каждого подпункта §M7-03 и все реальные blockers.
- Это one-time live view, поэтому в конце: `убито 0 / непойманных 0`; новых source-shape тестов не писать.
- Все запущенные процессы, порт и временный browser context очистить.
- Закоммитить только audit-artifact явным staging, не push. Ход не заканчивать до завершения foreground-проверок и коммита.
