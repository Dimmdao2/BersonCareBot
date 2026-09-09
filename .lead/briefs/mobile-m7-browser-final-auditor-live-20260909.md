# Тест или взгляд — #915 final browser/PWA M7-03 closure

Это один цельный live browser-аудит итогового committed candidate после принятого исправления active-call
navigation. Production-код и постоянные тесты read-only; разрешён только audit-artifact.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M7-03: «Browser/PWA live acceptance
покрывает install metadata обеих поверхностей, file fallback и iframe Jitsi». Строка закрывается только после
пользовательского OS chooser, внутренней навигации с тем же звонком и explicit terminal cleanup.

## Authority and rules

Перед каждым действием выполнить heading-map gate `AGENTS.md`. Полностью прочитать §1a, §9, §10, §10a, §10b,
§12, §15–§17, §20, §24; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`; mobile plan M4/M5/M7-03;
`.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md`; принятый active-call audit и exact
candidate diff. Не повторять неизменённые install metadata/APK/clinic-brand proofs.

## Required live path

Запустить exact candidate на свободном порту 5210–5219 мимо scripts, убивающих общие порты. Headed Chromium/Xvfb,
mobile viewport и затем desktop. Штатный doctor login — опубликованный owner password §1a. Patient — обычный
email OTP flow; на изолированном DEV допустим `DEV_EMAIL_OTP_DEBUG=true` по §1a, OTP используется внутри browser
сессии и не печатается в report/log excerpts. Это не bypass. Не создавать fixtures и не отправлять провайдерам.

1. Реальными кликами patient camera/gallery/document и одной doctor/CMS поверхности получить browser
   `filechooser`; подтвердить соответствующую OS/browser destination и отменить через пустой выбор. Не выбирать и
   не загружать файл, не вызывать `DeviceMedia`.
2. Реальным doctor flow начать self-hosted Jitsi iframe с synthetic media. Один раз сорвать `external_api.js`,
   нажать видимый retry, получить ровно один iframe.
3. После mount нажать видимую global navigation. Доказать сохранение того же iframe/render session в compact
   presentation, return indicator и возврат на exact call URL. Второй обычный start недоступен.
4. Нажать доступный explicit Jitsi end control; indicator исчезает, call очищен, конечное состояние наступает
   ровно один раз. Прямые callbacks/`Page.navigate`/synthetic terminal events не засчитываются.
5. Desktop сохраняет текущую раскладку без нового floating UI.

## Result

Единственный файл: `.lead/runs/mobile-m7-browser-final-20260909/90-final-audit-report.md`. Указать exact SHA,
порт/viewports, команды без секретов, бинарный verdict каждого пункта и observable evidence. Finding — только
достижимое нарушение owner requirement; style не finding. Новых тестов не писать: `убито 0 / непойманных 0`.
Остановить только свои процессы, удалить временный профиль/cookies/log extracts. Stage только report явным путём,
commit, не push; дождаться foreground-команд.
