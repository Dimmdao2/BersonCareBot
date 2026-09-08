# Same-branch fixer brief — #1100 Wave 2 D

Ты implementation fixer на `wt/video-meeting-ui-v3-20260908`. Exact chain:

- base `173bc8c45`;
- product `8ca8cc17b`;
- независимый audit/tests `8ebdbf2f6`, verdict `MUST FIX`.

Работай одним цельным проходом, дождись foreground-проверок и обязательно закончи committed SHA. Следующего хода
не будет. Перед каждым действием выполняй heading map из `AGENTS.md`; прочитай полностью §5, §7, §9–11,
§15–17, §21–22, §24. Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` и прямое owner-решение 08.09 в
`docs/OWNER_DECISIONS.md`. Findings и сохранённый oracle:
`docs/audit/video-meetings-full-surface-2026-09-08.md`.

## Исправить все девять findings одним проходом

1. Деструктурировать/протащить `createContinuation` без свободной переменной; обычный create appointment UI при
   отсутствии custom continuation остаётся ровно с прежним footer/behavior.
2. Использовать реальный Base UI Tabs API `keepMounted`, не Radix `forceMount`; заметка и незавершённый протокол не
   теряют state/focus при переключении.
3. `appointmentId` нельзя писать после проверки одной формы UUID. Найди и переиспользуй существующий
   authoritative appointment ownership seam/port: запись обязана принадлежать тому же client + organization.
   Валидная выбранная/созданная запись сохраняет binding; чужая/несуществующая получает единый безопасный отказ без
   existence oracle. Не создавай вторую SQL/read цепочку и не ослабляй тест. Если текущий port физически не умеет
   доказать ownership, безопасный временный результат — не связывать unverified id, но обычный start обязан работать.
4. Ошибка `resolvePatientPublicOrigin` не может валить уже созданную встречу/сессию. Ссылка и notification становятся
   bounded unavailable, doctor call остаётся startable. То же bounded поведение для rotate; не возвращай raw secret
   и не строй URL из staff browser origin.
5. Doctor live page проецирует existing `encounters` и `medical_record`: вкладка «Приём» доступна только при
   effective `encounters`; medical blocks внутри canonical form получают `medicalRecordEnabled`. Видео и заметка
   не зависят от этих модулей. Не создавать новый guard/resolver/write path.
6. Overlap confirmation сохраняет выбранную modality/continuation; «Онлайн-приём» после подтверждения ведёт в call,
   «Очный» — в canonical encounter. Nested confirmation footer не переделывать.
7. При `video_meetings=OFF` вся modal surface возвращает прежний footer/labels/actions «Отмена» + «Начать приём» и
   обычный canonical create footer. При ON во всех `select`/`without`/`create` ровно две требуемые modality actions.
8. Довести UI-02 как явное owner-требование: authenticated patient live при разрешённом `client_portal` показывает
   справа переключаемые существующие patient-visible данные дневника симптомов/выполнений и назначенной программы.
   Переиспользуй существующие server read models/components и patient primitives; не копируй API, не открывай эти
   panes гостевому `/live`, не смешивай patient UI с doctor UI. Если отдельные модули/политики скрывают данные,
   их существующий effective gate только сужает панель. Видео остаётся доступным независимо от `client_portal`.
9. Устранить `react-hooks/set-state-in-effect` без eslint-disable и без ухудшения fragment-only security/error state.

Дополнительно закрой незавершённый механический хвост A2: в пяти перечисленных аудитом typed fixture literals
добавь только обязательный `video_meetings` boolean, чтобы union компилировался. Assertions/behavior не менять, новых
тестов не создавать. Это разрешённая механическая fixture-правка, а не тестовое покрытие.

## Границы

Можно менять product files из candidate diff и минимально необходимые существующие patient diary/program
presentation/read loaders для UI-02. Можно механически поправить пять stale fixture literals из §8 audit artifact.
Audit tests/artifact `8ebdbf2f6` не редактировать, не удалять и не ослаблять. Нельзя менять schema/migrations/grants,
notifications transport, Jitsi/coturn package, тарифы, другие страницы/UI, PROD/TEST/DEV или shared server.
Перед добавлением abstraction/компонента докажи, что существующий нельзя узко параметризовать; предпочтение — один
canonical read/write path.

## Проверки и сдача

- Сначала запусти сохранённый audit test set и убедись, что два acceptance failures реально воспроизводятся;
  после product fixes повтори тот же exact set до зелёного.
- Запусти все релевантные retained video/guest/notes/encounter/surface tests, `pnpm webapp:typecheck`, scoped ESLint,
  применимые architecture gates и `git diff --check`; полный CI не запускать.
- View-findings 5–8 докажи чтением итогового diff и запиши в добавление к существующему audit artifact или короткий
  correction artifact; не создавай DOM/CSS/copy/button-count tests.
- Workers не пишут/редактируют/переименовывают/удаляют тесты, кроме названного механического boolean в пяти stale
  fixtures. Stage только explicit task paths, `git add -A` запрещён; не push.
- В финале: committed SHA, exact file list, повторный oracle/validations, mapping по findings 1–9 и честные
  runtime/visual blockers. Не заканчивай ход в ожидании процесса.
