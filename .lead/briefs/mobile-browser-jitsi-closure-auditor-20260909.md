# Тест или взгляд — #915 browser/PWA + Jitsi closure

Это один цельный live browser-аудит остатка M7-03 на exact committed candidate. Production-код и постоянные тесты не менять.

## Authority

- Прочитать карту заголовков `AGENTS.md`, затем полностью §1, §1a, §1b, §9, §10, §10a, §10b, §11, §12, §15–§20 и §24.
- Прочитать `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` §1.8–1.9, M4-01…M4-06, M5-06, M7-03 и `.lead/runs/mobile-final-browser-acceptance-20260909-r5/90-final-audit-report.md`.
- Точный M7-03 критерий: «Browser/PWA live acceptance покрывает install metadata обеих поверхностей, брендированную поверхность §M1-04, file fallback и iframe Jitsi».
- Точный lifecycle: «mobile browser/PWA сохраняет тот же звонок при внутренних переходах; на других страницах есть зональный индикатор возврата, а обычные start-call controls не позволяют начать второй звонок»; «только явное завершение очищает индикатор».

## Предмет и границы

Не повторять уже доказанные APK/PWA metadata пункты. Закрыть только instrumentation-blockers отчёта r5:

1. Реальными пользовательскими кликами на patient camera/gallery/document и одной doctor/CMS поверхности подтвердить открытие browser file chooser и отмену без upload. Использовать Playwright `filechooser`/headed Chromium под Xvfb или другой устойчивый browser boundary; не подменять вызовом JS-функции.
2. В обычном doctor/patient flow с synthetic media начать один self-hosted Jitsi iframe, выполнить именно внутренний Next-переход после mount, доказать сохранение того же render-session/iframe conference, mobile return indicator, возврат на точный URL и запрет второго start.
3. Явно завершить звонок через доступный пользовательский control; доказать очистку индикатора и ровно один terminal callback наблюдаемым конечным состоянием.
4. Разово сорвать загрузку `external_api.js`, увидеть штатный retry, затем один iframe. Не писать постоянный тест.
5. На desktop подтвердить отсутствие нового floating UI и сохранение текущего layout.

Запускать candidate на свободном 5210–5219 мимо scripts, убивающих общий порт. Штатный вход: Дмитрий Берсон; врач — опубликованный DEV-пароль из §1a, пациент — OTP flow, не password. Не создавать fixtures, не завершать upload, не вызывать provider delivery, не трогать TEST/PROD. Не читать/печатать OTP/cookies/secrets; временные данные удалить.

Если настоящий cross-origin Jitsi UI требует состояния, недоступного текущему owner-flow, назвать точный шаг и evidence. Нельзя засчитать `Page.navigate`, прямой вызов coordinator/SDK, reflection или synthetic callback вместо пользовательского пути. Код продукта не исправлять: достижимый дефект — finding и стоп для отдельного worker.

## Результат

- Единственный разрешённый файл: `.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md`.
- Бинарный verdict для каждого пункта, exact SHA, размеры viewport, команды/порты и наблюдаемый результат.
- Новых тестов не писать: это one-time live view. `убито 0 / непойманных 0`.
- Остановить только свои Chromium/Xvfb/Next процессы и очистить временный профиль/log/cookie.
- Закоммитить только audit-artifact явным staging, не push; дождаться всех foreground-команд.
