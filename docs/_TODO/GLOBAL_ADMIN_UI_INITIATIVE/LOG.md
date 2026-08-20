# LOG — Global Admin UI

## 2026-08-20

### Независимый аудит GA-L-01 / GA-L-02, worker `303c1680`

- Вердикт: **MUST FIX**. Authority: `OWNER_DECISIONS.md` item 10 и `STAGE_01_ANALYTICS.md`
  `GA-L-01/02` — файл упражнения не длиннее 10 минут (иначе только разрешённый видеохостинг), файл CMS
  не длиннее 20 минут; attachment должен ждать результата trusted media-worker probe.
- Blind kill-set до чтения worker tests: 601 s exercise; 1201 s CMS; swapped/collapsed thresholds;
  rejected exact 600/1200; attachment while duration is absent; ordinary save protected but bulk bypasses;
  CMS media-library bypass; accidental rejection of hosted/non-video media; another reachable
  exercise/CMS finalization bypass.
- Census выполнен code-search до точных back-reference searches; в частности,
  `node /home/dev/brain/tools/code-search.mjs "treatment program exercise personalized video media presign finalize attachment" --repo bcb -k 15`
  и `node /home/dev/brain/tools/code-search.mjs "individual_exercise editor-batch mediaId saveToCatalog create exercise" --repo bcb -k 20`
  вывели отдельный treatment-program individual-exercise write. Точные searches подтвердили две записи
  каталожного exercise action и один CMS save action.
- Finding 1, reachable CMS media-library bypass: `MediaLibraryInsertDialog.tsx:28-30,50-57` разрешает выбрать
  видео, `MarkdownEditor.tsx:180-184` вставляет его в `body_md`, а `actions.ts:126-134` проверяет только
  top-level `video_url` и записывает непроверенный `body_md` в `contentPages` (`:200-215`, `:265-280`).
  `MarkdownEmbeddedLink.tsx:73-115` затем отображает эту ссылку как видео. Результат: видео CMS дольше
  20 минут прикрепляется и показывается, вопреки owner item 10 / `GA-L-02`.
- Finding 2, reachable personal-exercise bypass: doctor upload возвращается сразу после confirm и постановки
  media-worker job (`InstanceAddLibraryItemDialog.tsx:426-477`, `api/media/confirm/route.ts:86-109`), после чего
  `instanceEditorBatchApply.ts:611-639` вызывает write без duration gate. Repo проверяет только owner/folder,
  `status=ready` и MIME (`pgTreatmentProgramInstance.ts:1050-1089`), затем пишет media attachment
  (`:1091-1129`). Результат: personal/catalog exercise с 601-second файлом создаётся до trusted probe,
  вопреки owner item 10 / `GA-L-01`.
- Finding 3, reachable ordinary exercise bypass: `actionsShared.ts:108-126` принимает любой absolute
  `http(s)` URL как legacy file; `exerciseVideoDurationRejection` пропускает его из-за отсутствия media UUID
  (`:129-138`), затем create/update записывает его (`:346-401`). Результат: произвольный CDN `.mp4`, в том
  числе длиннее 10 минут и без trusted probe, принимается как файл вместо разрешённой hosting URL.
- Малейший worker fix: провести все exercise attachment writes, включая editor-batch individual exercise,
  через один module-level gate после trusted probe и до DB write; запретить новый arbitrary absolute URL под
  видом exercise file (legacy можно только сохранить неизменным при редактировании существующей записи).
  В CMS извлекать и проверять все `/api/media/{uuid}` из `video_url` и `body_md` (а также сохраняемого legacy
  `body_html`) тем же module-level gate до `updateFull/upsert`.
- Сохранённый targeted run:
  `pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/media/videoDurationLimit.unit.test.ts src/app/app/doctor/exercises/hostedVideoExerciseSave.unit.test.ts src/app/app/doctor/content/sections/actions.entitlement.unit.test.ts src/modules/treatment-program/instanceEditorBatchVideoDuration.unit.test.ts`
  — **3 failed, 16 passed (19 total)**. Падают ровно три acceptance-теста findings выше.
- Fault injection (каждая временная production-мутация возвращена): команды с `-t "rejects files just over each limit"`,
  `-t "keeps the owner thresholds independent"`, `-t "accepts the exact 600 and 1200 second boundaries"`,
  `-t "waits for a trusted duration probe"`, `-t "не прикрепляет к упражнению файл длиннее десяти минут"`,
  `-t "не обходит лимит через пакетное создание упражнений из библиотеки"`,
  `-t "does not attach an overlong library video to CMS"`,
  `-t "leaves non-video media outside the duration gate"` и
  `-t "сохраняет ролик отдельным видом медиа и в очищенном виде"` каждая стала red после соответствующей
  независимой поломки. Production diff после возврата проверен командой
  `git diff --exit-code -- apps/webapp/src/modules/media/videoDurationLimit.ts apps/webapp/src/app/app/doctor/exercises/actionsShared.ts apps/webapp/src/app/app/doctor/content/actions.ts apps/webapp/src/modules/media/service.ts` — exit 0.

### Follow-up fix GA-L-01 / GA-L-02

- Закрыты все три acceptance-finding: CMS Markdown/legacy HTML, personal exercise editor-batch и
  arbitrary absolute file URL. Editor-batch получает тот же media-service duration gate до
  транзакционной записи; CMS проверяет library UUID во всех реально сохраняемых
  полях.
- Точный acceptance-run:
  `pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/media/videoDurationLimit.unit.test.ts src/app/app/doctor/exercises/hostedVideoExerciseSave.unit.test.ts src/app/app/doctor/content/sections/actions.entitlement.unit.test.ts src/modules/treatment-program/instanceEditorBatchVideoDuration.unit.test.ts src/modules/treatment-program/instance-service.mechanicWriteClearance.test.ts`
  — **4 files passed, 19 tests passed**. Файл mechanic-clearance имеет legacy-суффикс и проверен
  отдельно командой
  `pnpm --dir apps/webapp exec vitest --run src/modules/treatment-program/instance-service.mechanicWriteClearance.test.ts`
  — **1 file passed, 3 tests passed**.

- Состояние плана синхронизировано с production-кодом: страница аналитики уже подключена к агрегатору,
  закрыты реализованные CONNECT-блоки и предусмотренные заглушки.
- Единственный незакрытый пункт самой страницы — `GA-A-02b`: врачебные заходы не имеют ingest и показываются
  как «—». Связанные инфраструктурные `GA-L-01/02` (лимиты 10/20 минут) закрыты follow-up fix выше.
- Связанные планы сведены в README/ROADMAP: консоль клиник `#1068` реализована; поддержка `#1070` не начата и
  заблокирована DB/RLS security gate.
- Проверка: `pnpm --dir apps/webapp test -- src/modules/platform-analytics/platform-analytics.unit.test.ts
  src/app/api/admin/platform-analytics/platform-analytics.route.test.ts
  src/infra/repos/pgPlatformAnalyticsRoot.unit.test.ts` фактически запустила весь Vitest-проект webapp:
  `403` файла passed, `4` skipped; `1854` теста passed, `12` skipped.

## 2026-08-19

- Заведена папка инициативы. Карточка taskdb не создавалась.
- Записаны owner-решения по аналитике и лимитам видео.
- В `INFRASTRUCTURE_SECURITY_PLAN.md` п. 25 лимит «5–7 минут» помечен УСТАРЕЛО/ЗАМЕНЕНО → 10 мин файл
  упражнения (иначе хостинг iframe) / 20 мин файл CMS.
- Канвас кабинета: аналитика больше не 4 вкладки врача, а один экран с блоками платформы.
- Проверка механик: что уже есть в схеме/событиях — CONNECT; чего нет — STUB / NEW. См. STAGE_01.
- Ссылка хостинга в упражнении вынесена в кабинет врача: `DOCTOR_UI_REWORK` UI-EX-HOST (специалист + пациент).
- Этап 1 аналитики: страница `/app/doctor/analytics` подключена к `GET /api/admin/platform-analytics`
  (агрегаты drizzle, без drill-down). Заглушки: конвертация, дневник симптома, показы iframe.
