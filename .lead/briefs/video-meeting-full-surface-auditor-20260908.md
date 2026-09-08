## Тест или взгляд — обязательная первая секция аудита

Это первичный независимый audit-live новой Wave 2 UI/security surface на exact committed candidate
`8ca8cc17b` от базы `173bc8c45` в `wt/video-meeting-ui-v3-20260908`.

До чтения реализации и существующих тестов:

1. Выполни heading map `grep -n "^## \\|^### " AGENTS.md`, затем полностью прочитай §5, §7, §9–11,
   §12, §15–17, §21–22 и §24.
2. Прочитай authority `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: VM-06/07, ACC-01..06,
   NOTE-03..08, UI-01..07, GATE-01..04, §3 и Wave 2/3. Прочитай прямое owner-решение 08.09 в
   `docs/OWNER_DECISIONS.md`.
3. Составь и зафиксируй blind kill-set по каждому повторяемому поведению до чтения тестов.
4. Для каждого пункта отдельно выбери «тест» или «взгляд»:
   - security/authorization/fragment lifecycle/URL construction/session lifecycle/stable mount and action
     continuations — повторяемое поведение, пригодно для узких behavior tests;
   - визуальная композиция, текст, размеры/цвета/число кнопок, отсутствие брендинга Jitsi и responsive UX —
     одноразовый взгляд/live visual, source-string tests запрещены;
   - архитектурная изоляция Jitsi, отсутствие второго write path/gate и scope census — чтение diff/AST/rg,
     не тест на текст исходника.

## Предмет и границы

Проверь точный committed diff `173bc8c45..8ca8cc17b` и интеграцию с landed core/daily notes/notification:

- provider-neutral `VideoMeetingStage` и единственный Jitsi browser adapter; только self-hosted
  `session.endpoint/external_api.js`; mic/camera/hangup only; отсутствие `any`, provider leaks и remount от
  notes autosave/tab switches/collapse;
- doctor live page: постоянное видео слева, mounted вкладки «Заметка»/«Приём» справа, reuse
  `DoctorNotesPanel` и canonical `EncounterPageClient` write path, explicit hangup lifecycle, copyable branded
  guest link regardless of notification result;
- guest `/live`: secret только из fragment, после успешного capture удалён из address/history; exchange даёт
  только call capability и никогда private patient panes; correct branded origin plus one-host DEV/TEST fallback;
- authenticated patient live: normal patient auth, meeting/client/org match и workspace/tariff gate до session;
  при разрешённом кабинете доступны существующие patient-visible diary/completion/assigned-program panes, без
  дублирования read models; guest secret сам по себе их не открывает;
- три owner entry points: patient encounter area, Today next appointment, start-encounter modal. Video controls
  видимы только при effective `video_meetings`, независимо от `encounters`, appointment type и Online location;
  при выключенном модуле прежний невидео-путь не регрессирует;
- modal `select`, `without`, `create`: при включённом видео два действия «Очный приём»/«Онлайн-приём», create
  использует canonical appointment footer/returned appointment id, без второго footer и без изменения nested
  overlap confirmation;
- optional appointment id обязан принадлежать тому же клиенту/организации или безопасно отклоняться существующим
  authoritative write path; прямой подменой нельзя привязать звонок к чужой записи;
- UI-07: кроме exact live pages, названных buttons и узкой параметризации существующих notes/encounter/calendar
  components нет других UI-изменений.

Используй `code-search` до blind grep. Не трогай PROD, TEST, shared dev server, DB/migrations, Jitsi/coturn host.

## Что можно изменить

Аудитор продуктовый fix не делает. Временные fault injections в production обязан полностью откатить. Постоянно
можно оставить и закоммитить только:

- один компактный audit artifact `docs/audit/video-meetings-full-surface-2026-09-08.md`;
- недостающие полезные behavior acceptance-тесты по §10a/10b. Не тестировать строки исходника, copy, CSS classes,
  DOM shape, количество кнопок или импорты. Если поведение лучше доказать существующим тестом — переиспользуй его;
  тестовый дубль не создавай.

Каждый MUST FIX: достижимый сценарий + impact + точный owner/repo requirement + evidence. Recommendation/style не
finding. Если недостающее поведение не годится для теста, зафиксируй как view/runtime finding без имитации покрытия.

## Проверки и финал

- Запусти релевантные retained/new tests, webapp typecheck, scoped lint и `git diff --check`; не полный CI.
- Для каждого kill-set класса: зелёный test + один fault injection или падающий acceptance-test на текущем продукте;
  для view-only — exact visual/source inspection evidence и честный runtime blocker.
- Explicit staging only, не `git add -A`; commit message с `#1100`; не push.
- В финале: `PASS` или `MUST FIX`, candidate SHA, audit/tests SHA (если появился), список protected/killed/missed,
  точные команды и named blockers. Не исправляй найденный product defect и не заканчивай ход в ожидании процесса.
