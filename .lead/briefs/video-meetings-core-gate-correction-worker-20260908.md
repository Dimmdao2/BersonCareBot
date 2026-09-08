# Worker brief — #1100 video-meetings workspace gate correction

Ты implementation-worker. Выполни один цельный проход, дождись всех foreground-проверок и обязательно закончи
ход committed SHA в своей ветке. Следующего хода не будет.

## Канон и authority

1. Перед любым действием выполни карту заголовков `grep -n "^## \\|^### " AGENTS.md`, затем полностью прочитай
   относящиеся разделы: §1/1b для любых DB/runtime мыслей, §2–5, §7, §9–10b, §12, §16–17, §21–22 и §24.
2. Основной authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, особенно GATE-01…04, §3 и Поток A2.
3. Прямое owner-решение: `docs/OWNER_DECISIONS.md`, запись 08.09 о том, что видеозвонки — отдельный модуль
   `doctor_workspace_composition`, никак не зависящий от встроенного филиала/локации «Онлайн».
4. Закрытый registry: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.1/3/4/5.
5. До поиска по путям используй `node /home/dev/brain/tools/code-search.mjs "<query>" --repo bcb`; точный `rg`
   допустим после обнаружения символа.

## Результат этого прохода

Исправить уже приземлённый provider-neutral video core до UI-реализации:

- удалить `VideoMeetingOnlineGate`, причину `online_location_inactive`, DI-чтение `findBuiltInOnlineLocation` и
  HTTP-маппинг этой причины; не оставлять compatibility shim;
- добавить `video_meetings` в существующие закрытые `WORKSPACE_MODULE_KEYS` и
  `WORKSPACE_MODULE_DEPENDENCIES` как `video_meetings: []`;
- не создавать второй resolver/feature flag/gate: параметризовать и использовать существующие
  `resolve*WorkspaceModules` и `require*WorkspaceModuleForApi` seams;
- закрыть workspace-module guard все четыре существующие двери: doctor create, doctor lifecycle,
  guest secret exchange и authenticated patient join. Tariff остаётся существующим
  `requireEntitlementForRead/Mutation`; новый tariff-check внутри video service запрещён;
- guest exchange должен проверять organization-scoped effective module, но не должен зависеть от
  `client_portal`, `encounters` или doctor clinical-screen preference; authenticated patient join использует
  существующий patient/org guard согласно текущему контракту. UI здесь не строить;
- availability `video_meetings` в `app-layer/guards/workspaceModuleAccess.ts` и в `availableModules` страницы
  settings получает существующую tariff-механику `video_meetings`, никогда не `true`;
- добавить нормальную краткую подпись нового switch в существующий SettingsForm label registry, не менять другой UI;
- тем же коммитом обновить активный `IMPLEMENTATION_ROADMAP.md`: в C3M.1 сослаться на owner-расширение 08.09,
  в C3M.4 добавить `video_meetings` с исчезающим call UI/create/join и без зависимостей от encounters,
  client_portal или Online location;
- механически удалить устаревший `onlineGate` только из уже существующих fixtures, которые перестанут
  компилироваться. Это разрешённое следствие удаления API. Не создавать новые тесты, не расширять assertions,
  не ослаблять и не переписывать поведенческие acceptance-тесты.

## Scope

Разрешены только:

- `apps/webapp/src/modules/video-meetings/**` (production + минимальная механическая fixture-правка);
- `apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.ts`;
- `apps/webapp/src/app-layer/guards/workspaceModuleAccess.ts`;
- четыре существующих video-meeting route и минимально необходимые их импорты/call wiring;
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` только для удаления Online-gate wiring;
- `apps/webapp/src/app/app/settings/page.tsx` и `SettingsForm.tsx` только для availability/label нового модуля;
- компиляционно обязательные typed fixture literals после расширения закрытого key union — только добавить
  `video_meetings` с корректным boolean, assertions/behavior не менять;
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §C3M.1/C3M.4;
- короткий worker evidence artifact `docs/audit/video-meetings-workspace-gate-correction-2026-09-08.md`.

Запрещены live pages, call buttons, notes, encounter UI, notifications, Jitsi/coturn package, schema/migrations,
grants, deploy, DEV/TEST/PROD mutation, новые зависимости и любые прочие страницы.

## Проверки и сдача

- Перед кодом прочитай существующие helper signatures и все четыре routes; не угадывай API.
- Прогони точный `rg` на отсутствие `VideoMeetingOnlineGate|online_location_inactive` и на отсутствие нового
  чтения built-in Online location в video path.
- Прогони scoped ESLint изменённых TS/TSX, `pnpm webapp:typecheck`, существующие релевантные unit/route tests и
  `git diff --check`. Не запускай полный CI и не создавай временную БД.
- В evidence перечисли exact команды и результаты, включая известные внешние/последующие blockers без заявлений
  о готовности UI.
- Stage только явные task-paths (`git add -A` запрещён), commit message с `#1100`, не push.
- В финале сообщи committed SHA, точный file list, validations и все оставшиеся красные проверки. Не заканчивай
  ход в ожидании процесса.
