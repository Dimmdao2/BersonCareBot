# #1100 — high-Opus delta audit: video meetings workspace gate

## Тест или взгляд

Это разовая проверка полноты owner-плана и его соответствия существующей архитектуре. Доказательство — взгляд на
актуальные owner sources, plan delta и реальные code seams. Тесты не применимы и не пишутся: исполняемое поведение
будет проверять отдельный финальный auditor-live после реализации.

## Роль и режим

Ты независимый plan/architecture auditor до повторного запуска реализации. Только read-only анализ: production
code, tests, schema, plan и owner-registry не изменять; тесты не писать. Верни бинарный `PASS` либо `MUST FIX` с
точными достижимыми сценариями. Не расширяй scope советами или альтернативной архитектурой.

Сначала выполни `grep -n "^## \\|^### " AGENTS.md`, затем прочитай полностью `AGENTS.md` §12 и §24, а также
фактические релевантные разделы §5, §10a и §10b. Для поиска по коду сначала используй
`node /home/dev/brain/tools/code-search.mjs "<query>" --repo bcb`, потом точечный `rg`.

## Authority и предмет аудита

- Owner-registry: `docs/OWNER_DECISIONS.md`, раздел «Видимость и пациенты», включая добавленную 08.09 строку про
  видеозвонки.
- Исполняемый план: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, прежде всего `GATE-01`, архитектурная граница,
  Wave 0/1/2/3 и TEST rollout.
- Существующий канонический путь: `apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.ts`,
  `apps/webapp/src/app-layer/guards/workspaceModuleAccess.ts`, settings read/write UI и shell projection.
- Уже landed video core: `apps/webapp/src/modules/video-meetings/**`, его DI и create/join routes.

Проверь только новую delta:

1. Достаточно ли план заменил зависимость от встроенного филиала `Online` на отдельный
   `doctor_workspace_composition.modules.video_meetings`, без второго feature flag/resolver.
2. Сохраняет ли формула границы: tariff entitlement — upstream availability; workspace preference только сужает;
   выключенный модуль закрывает UI и все doctor/patient/guest create/join двери; состояние филиала Online не влияет.
3. Верно ли у `video_meetings` нет dependency на `encounters`/`client_portal`: гость без аккаунта и звонок без
   протокола остаются допустимы по owner scope.
4. Есть ли в плане точный implementation handoff для удаления уже landed `VideoMeetingOnlineGate` /
   `online_location_inactive`, расширения существующего закрытого registry/effective resolver, settings UI,
   shell/entry projection и guest/patient/doctor server doors.
5. Не конфликтует ли исправленный план с более новыми owner-решениями или фактическим C3M contract.

Найденное вне этих пяти пунктов — `OWNER QUESTION`/recommendation, не `MUST FIX` и не новая работа.

## Источник оракула

Дословная проверяемая цитата из `docs/OWNER_DECISIONS.md`: «видеозвонки включаются как отдельный модуль в этой же
настройке состава кабинета». Вторая обязательная граница из того же абзаца: «Их UI и server-side двери не зависят
от встроенного филиала/локации «Онлайн»».

## Формат результата

- `VERDICT: PASS` или `VERDICT: MUST FIX`.
- Для каждого MUST FIX: достижимый сценарий, impact, точное требование и конкретное место плана, которое надо
  исправить. Style/желательные улучшения не включать.
- Отдельно перечислить проверенные active owner sources и существующие code seams.
- Ничего не коммитить; завершить один ход полным ответом, не оставлять фоновых процессов.
