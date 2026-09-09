# Therapy Go + Therapysto thin Capacitor apps — execution plan

Дата owner-решения: **2026-09-09**. Taskdb: **#915**. Статус: **doing**.
Интеграционная ветка: `feat/doctor-ui-rebuild`. PROD, store submission и release signing вне автономного scope.

Независимый Opus plan review (M0-03) выполнен 2026-09-09 против базы `a40a1a211`. Его находки внесены прямо в
текст этого плана; отдельного audit-документа-источника задач нет (`AGENTS.md` §24.6: аудит — гейт, не источник
scope). Открытые owner-развилки собраны одним листом в §6a.

## 1. Owner authority and immutable outcome

1. Выпустить два отдельных Android-приложения для RuStore:
   - **Therapy Go** — пациент;
   - **Therapysto** — специалист.
2. Это тонкие Capacitor-обёртки над действующим Next.js. Webapp, SSR/RSC, серверная авторизация, страницы и
   бизнес-правила не копируются и не переносятся в отдельный mobile frontend.
3. На iOS остаётся устанавливаемая PWA. На Android PWA тоже остаётся доступной пользователям без RuStore.
4. Нативные возможности: Universal Push от RuStore, Jitsi Android SDK, камера с выбором фото/видео внутри одного
   экрана, общая галерея фото/видео и отдельный выбор документов.
5. Новые app/PWA иконки:
   - Therapy Go — `apps/webapp/public/brand/therapygo-app-icon-source.png`, знак с шариком;
   - Therapysto — `apps/webapp/public/brand/therapysto-app-icon-source.png`, знак без шарика.
   Старые admin/clinic-brand assets не удалять; platform-admin не подменять пациентским приложением.
6. Сторонние URL открываются только внешним браузером. Привилегированный WebView загружает только собственные
   разрешённые origin; каждый native plugin повторно проверяет origin и принимает узкий typed input.
7. Worker продуктового этапа тесты не пишет. Первый независимый `auditor-live` составляет blind kill-set до чтения
   тестов, добавляет только оправданные поведенческие acceptance-тесты и проводит fault injection по `AGENTS.md`
   §10a/§10b/§24.4–§24.5.

## 2. Superseded direction

Отменены владельцем и не исполняются: отдельный `apps/mobile` SPA с копиями экранов, local production web bundle,
отдельная mobile auth/session только ради оболочки, iOS native binary, APNs/Google-first release и запрет remote
Next.js WebView. Исторические документы перенесены в
`docs/archive/2026-09-native-mobile-local-bundle-retirement/`; открытых исполняемых чекбоксов там нет.

Причина смены: remote WebView имеет origin реального сайта, поэтому существующие cookie, CSRF, SSR/RSC и API
работают как в браузере; стены spike относились к local-origin mobile SPA и не применимы к выбранной оболочке.

Прямое следствие для двух прежних owner-вопросов MOB-00, всё ещё висящих открытым `question` на карточке `#915`:
пункт (a) «принять поворот на отдельный `apps/mobile`» и пункт (b) «пятый CSRF-класс для мобильного транспорта +
CORS-allowlist» **отменены решением 2026-09-09** — отдельного mobile-транспорта нет, запросы идут тем же origin с
теми же cookie и той же CSRF-моделью, что в браузере. Живым остаётся только пункт (c) — Android toolchain, он
перенесён в §6 как внешний gate и в `M2-00`.

## 3. Target architecture

```text
                        existing Next.js webapp
                therapygo.ru             therapysto.ru
                     |                         |
          PWA Therapy Go (iOS/Android)  PWA Therapysto (iOS/Android)
                     |                         |
              Android WebView           Android WebView
                 patient flavor         specialist flavor
                       \                   /
                    one shared apps/mobile-shell
                  typed JS bridge + Kotlin plugins
                    | Universal Push / Jitsi / CameraX
```

- Один native source tree, две product flavors и отдельные application IDs/resources/store artifacts.
- `test` и `production` — отдельная build dimension; TEST использует только TEST domains и `.test` application-id
  suffix. Production config не содержит секретов.
- Webapp использует один `NativeRuntime` adapter. Browser/PWA получает web fallback; Capacitor вызывает тот же
  публичный контракт через native bridge. Параллельных upload/video/push business paths не создавать.
- Candidate application IDs до внешней регистрации: `ru.therapygo.app` и `ru.therapysto.app`. Их нельзя считать
  закреплёнными в RuStore до owner-controlled создания карточек.
- Release start URLs: `https://therapygo.ru/app/patient` и `https://therapysto.ru/app/doctor`; TEST — соответствующие
  `test.*` hosts. Redirect внутри того же first-party surface разрешён, другой origin — внешний браузер.
- Первый Android-релиз допускает внутри привилегированного WebView только exact platform bootstrap-origin своего
  build variant. Custom-domain клиники остаётся полноценной browser/PWA-поверхностью, но из Android shell
  открывается внешним браузером без bridge/plugins. Это решение `G-2`; динамического origin allowlist в первом
  релизе нет.

## 3a. Измеренный baseline (база `a40a1a211`, 2026-09-09)

Числа получены командами; исполнитель пересчитывает их на своей базе теми же командами, а не цитирует отсюда.

| Факт | Значение | Команда |
|---|---|---|
| Production-входы `VideoMeetingStage` | 3 (doctor live, patient live, guest `/live`) | `rg -n '<VideoMeetingStage' apps/webapp/src --glob '!*test*'` |
| UI-точки выбора файла | 6 tsx | `rg -ln 'type="file"' apps/webapp/src --glob '*.tsx'` |
| PWA-манифесты | 2 route handler'а: `/manifest.webmanifest`, `/manifest-staff.webmanifest` | `rg -l 'PwaManifest' apps/webapp/src/shared/lib/pwa` |
| Точка идентичности документа | `shared/lib/surface/surfaceLayoutMetadata.ts` (вызывается только из `app/layout.tsx`) | `rg -n 'surfaceLayoutMetadata' apps/webapp/src` |
| Install-поверхности | `/app/patient/install`, `/app/doctor/install`, `/app/account` — **`/setup` в репозитории нет** | `find apps/webapp/src/app -type d \( -name install -o -name setup \)` |
| Имя пациентского приложения в коде | `PATIENT_DEFAULT_SURFACE_NAME = 'Therapygo'` (одним словом), env-override `PATIENT_APP_NAME` | `rg -n 'PATIENT_DEFAULT_SURFACE_NAME' apps/webapp/src/config` |
| Пациентские иконки сегодня | `/pwa-icon-192.png`, `/pwa-icon-512.png`, `/apple-touch-icon.png`; maskable нет | `rg -n 'pwa-icon\|apple-touch' apps/webapp/src/shared/lib` |
| Источники новых знаков | 1283×1226 и 1341×1173 — **не квадратные** | `node -e "const b=require('fs').readFileSync(p);console.log(b.readUInt32BE(16),b.readUInt32BE(20))"` |
| Chokepoint доставки | `createDefaultDispatchPort` + реестр `DeliveryAdapter[]` | `apps/integrator/src/infra/adapters/dispatchPort.ts` |
| Dev/TEST предохранитель отправки | `readChannel()` allowlist + `applyPreForkEnvironmentDeliveryPolicy` | `rg -n 'applyPreForkEnvironmentDeliveryPolicy\|isTestDeliveryRecipientAllowed' apps/integrator/src` |
| Выбор каналов | `modules/patient-notifications/resolveNotificationChannels.ts` + `topicChannelRules.ts` | `rg -n 'resolvePatientNotificationChannels' apps/webapp/src` |
| Рубильники глобального админа | `modules/system-settings/platformIntegrationAvailability.ts` (есть `id: 'web_push'`) | `rg -n "id: '" apps/webapp/src/modules/system-settings/platformIntegrationAvailability.ts` |
| Дверь загрузки медиа | `app-layer/media/mediaUploadAdapter.ts`, структурный гейт в lint | `apps/webapp/scripts/check-media-upload-door.mjs` |
| Android toolchain на боксе | JDK 21 есть; **Android SDK отсутствует** (`ANDROID_HOME` пуст, нет `sdkmanager`/`adb`) | `java -version; which sdkmanager adb; echo "$ANDROID_HOME"` |
| Место под toolchain | свободно 22 ГБ из 236 ГБ (91% занято) | `df -h /` |
| Аппаратное ускорение эмулятора | `/dev/kvm` есть, VT 8 ядер; пользователь `dev` **не в группе `kvm`** | `ls -l /dev/kvm; id \| grep kvm` |
| Workspace | pnpm 10.33.0, Node ≥22, packages перечислены явно | `pnpm-workspace.yaml`, `package.json` |

## 4. Execution stages and atomic acceptance

Галочку закрывает только lead после committed candidate, независимого audit evidence и собственной проверки.
Worker `done` и audit `PASS` сами по себе чекбокс не закрывают.

Каждая строка ниже закрывается доказательством своей природы (`AGENTS.md` §12, §24.4): разовое действие —
чтением итогового состояния/`rg`/introspection; повторяемое поведение — поведенческим тестом аудитора; внешнее —
только после owner/провайдер-гейта §6.

### M0 — authority, archive and measured baseline

- [x] **M0-01.** Старый local-bundle план перемещён в архив, снабжён forward-link, все его открытые чекбоксы явно
      отменены owner-решением 2026-09-09; `CURRENT_AUTHORITY_MAP`, `docs/README.md` и taskdb `#915` указывают только
      на этот план. Материально выполнено коммитом `a40a1a211` (`docs/CURRENT_AUTHORITY_MAP.md:66-72`,
      `docs/README.md:13`, `rg -c '^\s*- \[ \]' docs/archive/2026-09-native-mobile-local-bundle-retirement/*.md` = 0).
      Taskdb-портом `node /home/dev/brain/tools/taskdb.mjs set 915 question ""` снят отменённый MOB-00,
      `owner_waiting=false`; toolchain перенесён в исполняемый M2-00.
- [x] **M0-02.** Зафиксирован baseline §3a на текущей базе исполнения: каждая строка таблицы пересчитана своей
      командой. На SHA `18b61f52b` пересчёт дал: архивных open-checkbox `0`, active plan `37`, шесть file inputs,
      шесть файлов со ссылкой на `VideoMeetingStage` (три production callers, два tests, один stage), Android
      artifacts `0`; Node `v22.22.3`, pnpm `10.33.0`, JRE `21.0.12`, без `javac`/SDK. После plan/dependency commits
      продуктовые baseline-точки не менялись. RuStore cards/tokens/signing/physical device/PROD остаются external;
      DEV Android toolchain разрешён владельцем и выполняется M2-00.
- [x] **M0-03.** Независимый Opus review проверил полноту плана, отсутствие копии webapp/domain logic, границы
      workstreams и реальные owner blockers; принятые усиления внесены до запуска product workers.

### M1 — two PWA identities and install surfaces

Scope: `apps/webapp/src/shared/lib/pwa/**`, `shared/lib/surface/surfaceLayoutMetadata.ts`,
`config/productSurfaceNames.ts`, install-страницы и производные icon assets в `apps/webapp/public/**`.
Вне scope: любой другой patient/doctor UI redesign.

Идентичность документа и манифеста уже сведена в одну точку (`surfaceLayoutMetadata.ts`, вызывается только из
`app/layout.tsx`; манифесты — два route handler'а над `buildPatientPwaManifest`/`buildStaffPwaManifest`). Ни одна
строка M1 не заводит второй источник имени, иконок или манифеста — только параметризует существующий
(`AGENTS.md` §5).

- [x] **M1-01.** Default patient PWA называется **Therapy Go**: значение меняется в единственном литерале
      `PATIENT_DEFAULT_SURFACE_NAME` (`config/productSurfaceNames.ts`, сегодня `'Therapygo'`), env-override
      `PATIENT_APP_NAME` продолжает работать. `id`, `scope` и `start_url=/app/patient` установленного приложения
      не меняются — контракт уже установленных PWA переезд не трогает. Доказательство: product/correction
      `93f2d7b34` + `4f646315c`, независимый confirmation `ce42f825f`, landing `66ef65468`; публичный manifest
      oracle сохранил `id/scope/start_url` и env-aware surface resolver.
- [x] **M1-02.** Patient-манифест и patient-метаданные отдают знак **с шариком**, производный от
      `brand/therapygo-app-icon-source.png`: 192, 512, отдельный `purpose: 'maskable'` и apple-touch 180.
      Источник не квадратный (§3a), поэтому derive-шаг явно центрирует знак на квадратном холсте и оставляет
      maskable safe-zone; команда деривации и полученные размеры записаны в строке доказательства. Доказательство:
      `ce42f825f` дважды выполнил `pnpm --dir apps/mobile-shell run derive:brand-assets`, сравнил хеши 42 файлов и
      `identify` подтвердил Therapy Go 192/512/maskable 512/apple-touch 180; landing `66ef65468`.
- [x] **M1-03.** Staff PWA называется Therapysto, отдаёт знак **без шарика**, производный от
      `brand/therapysto-app-icon-source.png`, с тем же набором 192/512/maskable/apple-touch и `start_url=/app/doctor`.
      Patient и staff манифесты не ссылаются на файлы друг друга (`rg` по обоим builder'ам). Доказательство:
      независимый manifest oracle/fault injection `ce42f825f` (**убито 3 / непойманных 0**) и двухпроходная
      проверка производных Therapysto assets; landing `66ef65468`.
- [ ] **M1-04.** Брендированная пациентская поверхность (`patient_branded`) НЕ переименовывается и НЕ
      переиконивается в Therapy Go: имя по-прежнему берётся из `effectivePatientBrand.patientAppName`, а знак
      Therapy Go остаётся идентичностью `patient_default`. Сегодня branded-поверхность наследует пациентские
      иконки из `patientLayoutMetadata`, поэтому подмена файла молча перекрасила бы каждую клинику — это прямо
      запрещено owner-пунктом §1.5 «clinic-brand assets не подменять». Доказательство — снимок метаданных обеих
      поверхностей на именованном DEV.
- [x] **M1-05.** Platform-admin полностью исключён из patient/staff PWA-пути: `surfaceLayoutMetadata` для
      `platform_admin` не возвращает `staffPwaLayoutMetadata`; metadata `/app/admin/**` не содержит staff
      manifest/apple-web-app/staff icons; оба manifest route отвечают 404 на admin surface. `DoctorWorkspaceShell`
      на admin surface не монтирует `StaffPwaBootstrap`, а account/install UI не показывается ни при каком tab.
      Существующий чёрный admin asset сохраняется. Сегодня это НЕ готовое поведение: root resolver, staff manifest,
      account install section и bootstrap пропускают platform-admin, поэтому проверяется каждый вход. Доказательство:
      audit chain `dccaef384` + `ce42f825f`, 8 файлов / 50 retained tests, platform-admin metadata oracle и
      manifest/account/bootstrap route checks; landing `66ef65468`.
- [x] **M1-06.** Единственные пользовательские install-поверхности — `/app/patient/install` и
      `/app/account?tab=install` для специалиста. `/app/doctor/install` остаётся совместимым redirect специалиста
      на account install и не показывает UI platform-admin; новый `/setup` не создаётся. Patient использует
      существующий `PwaInstallSection`, staff — `StaffPwaInstallSection`; обе дают краткие инструкции iOS Safari и
      Android browser без второго параллельного install-компонента. Доказательство: route/UI acceptance в
      `dccaef384` и confirmation regression `ce42f825f`; landing `66ef65468`. Живой browser/PWA проход остаётся
      частью M7-03 и не подменён unit-проверками.
- [ ] **M1-07.** Все install prompts, web-push controls и регистрации `/sw.js` проходят через один typed
      `NativeRuntime` detector из M3. В Capacitor он скрывает install UI, не подписывается на
      `beforeinstallprompt` и возвращает no-op из общей service-worker registration door; browser/PWA остаётся
      прежним. Проверены все сегодняшние обходы: `LandingPwaClientBootstrap`, `StaffPwaBootstrap`,
      `PwaInstallSection`, `registerPatientServiceWorker` и install-page push controls. `PlatformMode`
      (`bot|mobile|desktop`) и `messengerMiniApp` остаются ортогональными, не вторым Capacitor detector.

### M2 — reproducible shared Android/Capacitor shell

Scope: `apps/mobile-shell/**`, `pnpm-workspace.yaml`, root workspace wiring, build documentation. No product page copies.

- [x] **M2-00.** Android toolchain доступен и зафиксирован: SDK/cmdline-tools установлены, лицензии приняты,
      `ANDROID_HOME` задан, `sdkmanager --list_installed` и `adb --version` печатают версии, занятое место названо
      числом. Установка на DEV-бокс разрешена решением §6a `G-1`; ни одна другая строка M2/M7, требующая сборки
      APK, до фактической проверки toolchain закрыта быть не может.
- [ ] **M2-00a.** Для `M7-04` дополнительно: установлен system image эмулятора и пользователь агента добавлен в
      группу `kvm` (сегодня он в неё не входит — §3a). Без KVM эмулятор запускается программной эмуляцией и как
      приёмочный инструмент непригоден. Это привилегированное host-действие: выполняется порт-агентом по решению
      `G-1`, не из рабочего хода.
- [x] **M2-01.** Создан один workspace package на pin-compatible Capacitor 8 с Android source artifacts, двумя
      product flavors `therapygo`/`therapysto` и environment dimension `test`/`production`. Четыре логические
      brand×environment комбинации воспроизводимы: debug APK честно отмечены как debug-key signed, release APK/AAB
      собираются unsigned без внешнего release keystore; стандартные debug/release build types не удаляются.
      Доказательство: product `533bb29b1`, audit `49f584040`, all-variant build `a0dfd6576`, landing `d7f99340c`.
- [ ] **M2-02.** Пакет корректно встроен в monorepo: добавлен в `pnpm-workspace.yaml`, и корневые
      `pnpm -r --parallel run typecheck`, `eslint .` и `pnpm run ci` проходят с ним — либо потому, что пакет
      несёт реальные скрипты, либо потому, что их отсутствие объявлено явно. Gradle/Android артефакты и локальные
      SDK-пути не попадают в git (`git status --porcelain` чист после сборки).
- [x] **M2-03.** Flavors имеют отдельные application IDs, names, supplied icons/adaptive icons, splash resources,
      theme colors, start URLs and allowed origins. Signing credentials/service tokens отсутствуют в git и bundle.
      Доказательство: `49f584040` сверил четыре APK через `aapt` и secret/artifact scan; landing `d7f99340c`.
- [x] **M2-04.** Shell показывает startup/loading/offline/server-unavailable state, корректно обрабатывает Android
      back/navigation и не обещает offline business data. HTTP/WebView cache используется штатно, video cache не
      добавляется. Доказательство: `49f584040` нашёл main-frame defect, `a0dfd6576` исправил его; тот же retained
      4-variant oracle и APK/AAB builds зелёные, landing `d7f99340c`.
- [x] **M2-05.** Один navigation policy является chokepoint: first-party surface остаётся в WebView; `http(s)` на
      другой origin, cleartext `http`, `mailto` и `tel` уходят в системный browser/app; другие custom schemes,
      `intent`, `file`, `content`, `javascript` и userinfo без отдельного owner-approved exact allowlist отклоняются.
      Правило одно и параметризуется build config — второй проверки «а ещё здесь» не заводится. Доказательство:
      blind kill-set/fault injection `49f584040` (28 тестов × 4 variants), landing `d7f99340c`.
- [x] **M2-06.** Первый Android-релиз разрешает внутри привилегированного WebView только один platform bootstrap
      origin конкретного build variant: Therapy Go — patient platform origin, Therapysto — staff platform origin;
      TEST и production раздельны. Runtime/server-discovered расширения allowlist и custom-domain origin нет. 308
      или навигация на custom-domain проходит через M2-05 во внешний браузер; bridge/plugins там недоступны.
      Неизвестный, cross-surface или неподтверждённый origin fail-closed считается внешним. Доказательство:
      cross-brand/environment/origin injections и exact variant artifact inspection `49f584040`, landing `d7f99340c`.
- [x] **M2-07.** Bridge и каждый plugin fail closed для недоверенного origin. Cleartext traffic запрещён release-
      конфигурацией; logs не содержат cookies, fragment secrets, Jitsi JWT, push tokens или media presigned URLs.
      Доказательство: runtime gate injections, release manifest/aapt и secret scans `49f584040`, landing `d7f99340c`.
- [x] **M2-08.** README содержит точные команды sync/build, расположение APK, требования JDK/Android SDK и процесс
      создания RuStore signing artifact без приватного ключа в repository. Доказательство: audited README и
      reproduced commands/artifacts `49f584040`, landing `d7f99340c`.

### M3 — one typed NativeRuntime boundary in webapp

Scope: shared browser/native adapters and narrow integration points. Apply `AGENTS.md` §5 «Один общий проход».

Кандидат на консолидацию назван заранее: клиентский контекст среды уже существует
(`shared/lib/platform.ts`, `PlatformProvider`, `messengerMiniApp.ts`). `NativeRuntime` расширяет его, а не встаёт
рядом; если это структурно невозможно, причина пишется в строке доказательства.

- [ ] **M3-01.** Есть один строго типизированный `NativeRuntime` boundary с browser fallback и Capacitor adapter;
      product pages не читают `window.Capacitor` и не импортируют Kotlin/plugin details напрямую
      (`rg 'window.Capacitor' apps/webapp/src` даёт только сам adapter).
- [ ] **M3-02.** Runtime сообщает `browser|therapygo_android|therapysto_android`, app version и capability flags;
      server authorization не доверяет этим значениям как роли/org identity и не меняет из-за них ни одну проверку
      доступа.
- [ ] **M3-03.** App lifecycle resume обновляет session-dependent push registration safely; logout/offboarding
      вызывает единый revoke path. Отсутствующий plugin деградирует в web behavior без белого экрана.

### M4 — native Jitsi without a second video page

Scope: native Jitsi plugin (`apps/mobile-shell/**`) плюс существующий шов `VideoMeetingStage`.

**Границы с активным `#1100`.** Живые файлы `#1100` — `apps/webapp/src/shared/ui/video/**`,
`app/app/doctor/patients/[userId]/live/**`, `app/app/patient/live/**`, `app/live/**`; в них ещё открыты VM-06,
VM-10, VM-11, VM-12, UI-08, UI-09, UI-10. `M4-01` по определению трогает `VideoMeetingStage.tsx` внутри этой
границы, поэтому:

1. M4 стартует только после приземления текущего кандидата `#1100` в `feat/doctor-ui-rebuild`;
2. правка аддитивная — одна ветка выбора рендера плюс отдельный native-adapter файл; `JitsiMeetingRenderer` не
   переписывается;
3. владелец `#1100` остаётся authority для browser-пути; расхождение — вопрос владельцу, не правка M4.

- [ ] **M4-01.** `VideoMeetingStage` сохраняет один provider-neutral render contract на все три production-входа.
      Browser использует существующий iframe renderer; доверенный Android runtime открывает Jitsi Android SDK на
      том же `endpoint`, `roomReference` и `accessToken`. Серверный `VideoMeetingRenderSession.renderer`
      (`'embedded_conference' | 'peer_connection'`) новых значений НЕ получает: выбор нативного пути делает клиент
      по `NativeRuntime`, иначе сервер начал бы утверждать клиентскую возможность вопреки `M3-02`.
- [ ] **M4-02.** Jitsi runs in a native full-screen Activity, returns joined/terminated/error events, honors explicit
      user start, microphone/camera permissions, hangup and retry, and never prints room/JWT/guest secret in logs.
- [ ] **M4-03.** Therapy Go and Therapysto both reach the same self-hosted `meet.therapysto.ru`/TEST counterpart;
      `meet.jit.si`, JaaS and other external media/telemetry endpoints are absent. Jitsi JWT/issuer/secret
      по-прежнему читаются только из restricted `system_settings` (`jitsi_*` ключи) и в bundle не попадают.
- [ ] **M4-04.** Specialist can return from native call to the unchanged notes/encounter page; no separate mobile
      notes implementation is created. Browser/PWA video behavior remains operational.
- [ ] **M4-05.** Нативный adapter подключён к тому же нейтральному шву, что и будущий PeerJS/native-WebRTC provider
      (`#1100` VM-08), и не закрывает смену провайдера: замена рендера не требует правки product-страниц.

### M5 — camera, gallery, documents and streaming upload

Scope: один media-source adapter, Android CameraX/pickers и существующие upload-сервисы. Второй медиабиблиотеки
не заводить и авторизацию presign/confirm не обходить.

Существующая дверь: `app-layer/media/mediaUploadAdapter.ts` с закрытым `UploadPolicyId` (политика решает и
физическое хранилище — owner ruling 06.09.2026), структурно охраняемая `scripts/check-media-upload-door.mjs` в
lint. Multipart уже построен (`beginPreparedMultipartUpload`/`completePreparedMultipartUpload`/
`tryFinalizeMultipartIdempotentTx`, маршрут `/api/media/multipart/part-url`).

- [ ] **M5-01.** Один контракт `DeviceMedia` (`captureMedia`, `pickMedia`, `pickDocument`, `upload`) обслуживает
      все 6 существующих UI-точек выбора файла (§3a); каждая из них параметризует этот шов вместо собственного
      определения среды. Существующий пациентский выбор источника
      (`ProgramItemSubmissionSourceDialog.tsx`, уже дающий «камера / галерея / документ») расширяется, второй
      диалог выбора источника не создаётся.
- [ ] **M5-02.** Android camera screen uses CameraX and lets the user switch Photo/Video in the camera itself;
      front/back camera and runtime permissions work, cancellation returns without a fake error.
- [ ] **M5-03.** Gallery accepts images/videos together through the system picker; document action is separate and
      uses the system document picker with narrow MIME filters.
- [ ] **M5-04.** Крупное медиа остаётся native content URI и стримится в уже авторизованный presigned URL через
      существующий multipart-путь; base64-моста и копии всего видео в JS heap нет. Существующие confirm/failure
      semantics, идемпотентная финализация и media metadata переиспользуются.
- [ ] **M5-05.** Нативный путь проходит ту же дверь: `node apps/webapp/scripts/check-media-upload-door.mjs` и
      `--self-test` зелёные, ни один маршрут не получает новый storage-аргумент и не зовёт `presignPutUrl`/
      `s3*` в обход `mediaUploadAdapter`. Выбор бакета по-прежнему делает `policyId`, а не вызывающий.
- [ ] **M5-06.** Browser/PWA сохраняет standards-based file inputs с раздельными camera/media/document действиями
      там, где браузер их даёт. Native-only возможность никогда не ухудшает браузерную загрузку.

### M6 — RuStore Universal Push end to end

Scope: provider-neutral native target model, server delivery adapter, Kotlin Universal Push bridge и tap routing.

**Authority.** Каналы, содержание и получатели уведомлений: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §2, §15,
§18, §21–§25, §27, §28 — единственный источник (`docs/CURRENT_AUTHORITY_MAP.md:59`). Ссылаться на `NTF-01` как на
authority нельзя: он частично отменён владельцем 27.07. Конфигурация — `AGENTS.md` §2–§4; ownership новых данных —
§4a; единственный проход — §5.

- [ ] **M6-01.** Native targets хранятся отдельно от `user_web_push_subscriptions` и принадлежат каноническому
      `platform_user` через прямой `user_id`: установка имеет `app_id`/`provider`/несекретный
      `installation_id_hash`, token material — ciphertext плюс несекретный hash для rotation/idempotency.
      Шифрование идёт через объявленный native-push модулем `NativePushTokenCipher` port; production adapter
      получает отдельный process-bootstrap keyring с key id/rotation, не импортирует `staff-security/crypto.ts`,
      не использует `STAFF_SECURITY_KEYRING_JSON`, `system_settings` или app bundle. Org-scoped выдача target всегда
      повторно доказывает membership/enrollment по `(organizationId,userId)`; target не дублируется по организациям.
      Разбор прав миграции — по `AGENTS.md` §1.
- [ ] **M6-02.** Native push НЕ становится новым видимым пользователю каналом: для получателя это тот же класс
      «push», а native target — его транспорт. Поэтому `CHECK`-ограничение `user_notification_topic_channels`
      (`telegram|max|vk|email|web_push`) и профильные переключатели не расщепляются. Если резолвер §21 структурно
      не может выразить транспорт внутри канала, это фиксируется вопросом владельцу (§6a), а не вторым каналом.
- [ ] **M6-03.** Authenticated register/rotate/revoke endpoints тонкие и зовут один service/port. Logout,
      offboarding и provider invalid-token responses деактивируют targets идемпотентно; сырые токены не попадают
      в логи, taskdb и delivery-attempt payloads.
- [ ] **M6-04.** Kotlin plugin интегрирует RuStore Universal Push SDK напрямую (без временной direct-RuStore
      реализации), включает RuStore-провайдер и сообщает availability/new token/message/errors через типизированный
      мост. Точная версия SDK не декларируется планом заранее: исполнитель фиксирует разрешённую версию и команду,
      которой она получена. FCM/HMS остаются добавляемыми провайдерами без передела JS-контракта и схемы.
- [ ] **M6-05.** `web_push` остаётся единственным логическим каналом «Push» в contracts, preferences, queue rows и
      UI. Существующий `DeliveryAdapter` для `web_push` становится composite app-push adapter и внутри одного
      `createDefaultDispatchPort` fan-out'ит browser Web Push и native RuStore transport по targets/config.
      `rustore_universal_push` не появляется как второй logical channel. Intent получает typed
      `pushSurface=therapygo|therapysto`, отдельный allowlisted `nativeRoute` и
      `notificationKind=message|reminder|call`; event-producer называет тип/получателя, не provider, и transport
      не вызывается в обход chokepoint (`OWNER_PRODUCT_RULES` §21, `AGENTS.md` §5). Browser `url` и
      `nativeRoute` — разные поля: custom-domain/guest browser URL никогда не передаётся Android как доверенный
      маршрут; для приглашения на звонок нативный маршрут ведёт на authenticated patient/doctor live surface.
- [ ] **M6-06.** 🔴 Оба транспорта logical `web_push` проходят неизменённые `assertOutboundMessagePolicy` и
      единственный `applyPreForkEnvironmentDeliveryPolicy` ДО composite provider fork; второго `readChannel` или
      TEST-gate для RuStore нет. Текущий `TEST_ACCOUNT_WEB_PUSH_USER_IDS` применяется к browser/native одинаково.
      Поведенческое доказательство: `TEST=true` подавляет non-test recipient до любого transport, local DEV не
      вызывает ни Web Push, ни Universal Push provider (`AGENTS.md` §1b, owner §23).
- [ ] **M6-07.** Глобальный админ управляет одним логическим каналом через существующий
      `platform_integration_availability.web_push`; отдельного пользовательского/provider toggle нет. Выключенный
      `web_push` блокирует оба transport до fork. Внутри включённого composite отсутствие VAPID не блокирует
      настроенный Universal Push, отсутствие RuStore credentials/target не блокирует Web Push, отсутствие обоих
      даёт typed no-active-target. UI-label меняется с «Web Push» на «Push», persisted code не меняется.
- [ ] **M6-08.** Project ID / auth token / endpoint живут только в restricted DB-backed `system_settings`:
      объявлены в `modules/system-settings/registry.ts` как `restricted('admin','global',…)`, секрет — типом
      `secret_envelope` с `redacted`, ключи добавлены в `ALLOWED_KEYS` (`types.ts`), чтение — только через
      санкционированные accessors (`apps/webapp/scripts/check-system-settings-accessors.mjs` зелёный). Ни env, ни
      app bundle их не несут.
- [ ] **M6-09.** Payload несёт только факт, дату-время и ссылку в кабинет плюс allowlisted внутренний маршрут —
      без текста сообщения/переписки, клинических деталей, имени файла, presigned URL, cookie, токена и
      организационного секрета (`OWNER_PRODUCT_RULES` §22 и §15). Тексты берутся из существующих builder'ов
      (`modules/web-push/pushNotificationCopy.ts`), новая копирайтинг-ветка не заводится. Data-only RuStore wire
      фиксирован как `{pushSurface,notificationKind,route,title,body}`: `route` берётся только из
      `nativeRoute`, а аналитический `pushKind` (`custom|warmup|training|news`) не переиспользуется как Android
      notification channel. Backend и Android независимо проверяют surface/kind/route и ограничивают длину
      title/body. Tap ведёт внутрь правильной поверхности приложения; внешние и обманные маршруты отклоняются.
- [ ] **M6-10.** Android notification permission и стабильные каналы реализованы. Напоминания, звонки и сообщения
      могут использовать отдельно настроенные bundled sounds; пользовательские настройки каналов Android остаются
      главнее. Android отображает прошедшие server-side copy/policy `title`/`body`, а не hardcoded placeholder;
      staff-маршруты имеют тот же allowlist на обеих сторонах: `/app/doctor`, `/app/settings`, `/app/account`.
- [ ] **M6-11.** Denied Android permission, отсутствующая transport-конфигурация или active browser/native target
      дают typed non-secret skipped/no-active-target outcome и метрику logical `web_push`; provider не вызывается,
      raw token не логируется, unauthorized messenger fallback не включается. Существующий canonical domain/in-app
      source конкретного сценария остаётся источником факта и не удаляется из-за недоставленного push. Строка НЕ
      создаёт универсальную notification-event таблицу и не разрешает общий notification-family refactor; сценарий
      без уже существующего canonical source остаётся за действующим notification workstream.

### M7 — independent audits and integration gate

- [ ] **M7-01.** Каждая новая поверхность получает один независимый `auditor-live` проход: shell/navigation
      security, web/native bridge + PWA, Jitsi/media, native-target lifecycle/provider delivery. Аудитор начинает
      с «тест или взгляд» (§24.4), строит blind kill-set до чтения тестов и фиксирует fault-injection evidence.
      Аудитор не слабее автора; его находка вне owner scope — вопрос владельцу, а не работа (§24.6).
- [ ] **M7-02.** Workers тестов не писали. Тесты аудитора защищают только устойчивое поведение и security-контракты;
      тестов на текст исходника, формулировки/количество/раскладку UI и на факт вызова реализации нет, а
      встреченные в затронутом scope — удалены, кроме incident-backed с названным наблюдаемым отказом.
- [ ] **M7-03.** Оба TEST APK variants собираются на Linux (зависит от `M2-00`). Browser/PWA live acceptance
      покрывает install metadata обеих поверхностей, брендированную поверхность §M1-04, file fallback и iframe
      Jitsi — это выполнимо в репозитории и на именованном DEV/TEST без внешних гейтов.
- [ ] **M7-04.** Android acceptance на эмуляторе покрывает origins/внешние ссылки, камеру, документы, native Jitsi,
      состояния разрешений и tap уведомления с подставным провайдером. Физическое устройство и реальная доставка
      через инфраструктуру RuStore — внешние гейты §6, они блокируют только эту строку и `M7-05`.
- [ ] **M7-05.** Реальная доставка Universal Push подтверждена на TEST после закрытия внешних гейтов §6.
- [ ] **M7-06.** Targeted/phase проверки зелёные на candidate SHAs. Поскольку изменение затрагивает root
      dependencies, lockfile, webapp, integrator и Android package, один полный CI гоняется под общим замком хоста
      (`/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`) только на финальной интеграции.
- [ ] **M7-07.** Интегрированный `feat/doctor-ui-rebuild` содержит plan evidence по каждому чекбоксу, taskdb `#915`
      соответствует факту, коммиты запушены через проверенный wrapper (`pnpm push:checked`), ни один worker
      clone/process не остался живым.

## 5. Parallel workstreams

Работа начинается только после M0-03 plan review. Параллель — по непересекающимся file-scope (`AGENTS.md` §24.3),
каждый workstream в своём worktree и ветке `wt/<workstream>`.

| # | Workstream | Единственный file-scope | Закрывает | Зависит от |
|---|---|---|---|---|
| 1 | Shell/native foundation | `apps/mobile-shell/**`, `pnpm-workspace.yaml`, root build docs | M2 | `M2-00` (toolchain) |
| 2 | Native capabilities | только `apps/mobile-shell/**` | M4 (native половина), M5-02/03, M6-04, M6-10 | 1; для M4 — приземление `#1100` |
| 3 | Web/PWA adapters | `apps/webapp/src/shared/lib/pwa/**`, `shared/lib/surface/**`, `config/productSurfaceNames.ts`, `public/**`, install-страницы, `shared/ui/video/**`, медиа-UI и `app-layer/media/**` | M1, M3, M4-01/04/05, M5-01/04/05/06 | 1; `#1100` для `shared/ui/video/**` |
| 4 | Push backend | `apps/webapp/db/schema/**` + migration, `modules/**` native-push target/cipher port, `app/api/**` registration/M2M access, `modules/system-settings/**`, `apps/integrator/src/**` composite app-push/provider delivery | M6-01/02/03/05/06/07/08/09/11 | 1 — frozen `app_id`/`provider`/`installation_id_hash` и token-event contract; не зависит от `NativeRuntime` landing |

Пересечения, которые нельзя игнорировать:

- `shared/ui/video/**` принадлежит потоку 3 и одновременно живому `#1100` — сериализуется, не параллелится.
- `NativeRuntime` (поток 3), Universal Push client bridge (поток 2) и push backend (поток 4) идут параллельно после
  фиксации общего typed contract. Поток 4 не импортирует и не ждёт `NativeRuntime`: он строит server endpoints,
  target lifecycle и composite delivery. Единственное пересечение — lead-owned integration M3-03 после landing
  трёх audited candidates: runtime передаёт token event в готовый register/rotate/revoke API.
- Поток 4 трогает **оба** приложения (webapp и integrator) — это не «backend без UI», а сквозной канал; общий
  dev-сервер и полные прогоны под ним сериализуются.

Lead приземляет проверенные ветки по одной, разбирает интеграционные швы, затем гоняет финальные app-level/full gates.

Каждый worker brief цитирует точные M-ID и их текст, относящиеся разделы `AGENTS.md` и обязан явно спросить, нельзя
ли параметризовать существующую точку вместо новой функции/обёртки/гейта (`AGENTS.md` §5, §24.2). Кандидаты на
консолидацию названы заранее в самих этапах: `surfaceLayoutMetadata`, `PlatformProvider`/`platform.ts`,
`VideoMeetingStage`, `mediaUploadAdapter`, `createDefaultDispatchPort`, `resolveNotificationChannels`,
`platformIntegrationAvailability`, `system-settings/registry.ts`.

## 6. External/owner gates — not reasons to stop repository work

- RuStore application cards, final immutable package IDs, Universal Push project IDs/service tokens.
- Release keystore/signing, signed AAB/APK and store submission.
- Physical Android real-device acceptance and final notification delivery through RuStore infrastructure.
- PROD credentials/configuration/deploy and any Google Play/App Store work.
- Android SDK/JDK/emulator setup на DEV-боксе разрешён владельцем 2026-09-09 и исполняется как M2-00/M2-00a;
  это больше не owner gate.

Repository code, unsigned TEST APKs, mocks/fakes against published protocols, PWA behavior, documentation и
security/audit gates идут без этих входов. Отсутствующий внешний вход фиксируется блокером конкретной строки,
никогда — поводом бросить план.

## 6a. Owner gates одним листом

Закрываются за один присест до старта зависимых этапов; у каждого — рекомендация и safe default.

| ID | Развилка | Рекомендация | Safe default, если ответа нет | Блокирует |
|---|---|---|---|---|
| `G-1` | **РЕШЕНО владельцем 2026-09-09:** SDK/JDK/emulator ставятся под отдельный user-owned prefix на DEV-боксе; unrelated caches не чистятся, PROD не затрагивается | — | — | не блокирует; исполняется M2-00/M2-00a |
| `G-2` | **РЕШЕНО владельцем 2026-09-09:** первый Android-релиз — только platform origins; custom-domain открывается внешним браузером | — | — | не блокирует |
| `G-3` | **РЕШЕНО owner canon §21:** один пользовательский класс «Push», native — transport внутри него | — | — | не блокирует |

Развилки, которые владельцу НЕ выносятся (инженерные, решаются по мировой практике и канону): выбор точки
консолидации, форма моста, схема хранения токена, порядок этапов, набор тестов.

## 7. Evidence ledger

| ID | Status | Evidence |
|---|---|---|
| M0-01 | done | Archive/authority/icon commit `a40a1a211`; taskdb `#915` question cleared and `owner_waiting=false` through taskdb port on 2026-09-09. |
| M0-02 | done | Exact commands/results are recorded in §3a and M0-02; lead recalculated them on `18b61f52b`. |
| M0-03 | done | Independent high-Opus plan candidate `0864df016`, landed by port as `229a243e7`; lead corrected two contradictions exposed by read-only architecture mapping before product launch. |
| M2-00 | done | Port ops run `mobile-android-toolchain-ops-20260909`: `/home/dev/.local/share/bcb-android/env.sh`; `javac 21.0.12.1`, cmdline-tools `23.0.0`, build-tools `36.0.0`, platform 36, adb `37.0.1`, emulator `37.1.11`, API 36 Google APIs x86_64 image and `bcb-api36` AVD. Exact `df -B1 /`: before `18180792320`, after run `9359036416`, consumed `8821755904` bytes. Lead repeated all version/list checks. |
| M2-00a | open | System image/AVD are installed, but `id dev` lacks group `kvm`; `/dev/kvm` is `root:kvm 0660`, and passwordless sudo is unavailable. Requires `sudo usermod -aG kvm dev` plus new login/`sg kvm`. |
| M2-01, M2-03…M2-08 | done | Product `533bb29b1`, independent blind audit/tests `49f584040`, accepted correction `a0dfd6576`, port landing `d7f99340c`; exact evidence is in `.lead/runs/mobile-shell-foundation-audit-20260909/`. |
| M2-02 | open | Workspace wiring/typecheck/lint/build are proven; the root `pnpm run ci` clause remains for final integrated M7-06 and is not claimed early. |
| M1-01…M1-07, M3-01…M7-07 | open | Заполняет только lead после committed implementation + independent acceptance. |
