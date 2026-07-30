# UX-01 Reconciliation Review

**Дата:** 2026-07-15
**Проверяемый inventory baseline:** work3 `e501709a311543331c2ebd47e147224c38f632e6`
**Текущий основной code HEAD:** `a537e74df6e5e38d589dd7dc0ec8549dcf848756`
**Канон ролевого прохода:** `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, §5.1
**Вердикт:** **FAIL — UX-01 ещё не закрыт**, но операционного блокера на продолжение нет.

Причина FAIL: route-file inventory полный, а текущая визуальная база — нет. Готовые TEST-наборы дают актуальный desktop-срез public и clinic-owner/clinic-admin, но не дают registration, patient, isolated regular doctor, global admin и mobile role/navigation slices. Старые UX-01 документы также сохраняют уже неверный DEV/schema blocker и не знают о новых раздельных dev-входах.

## 1. Что проверено

До точечного чтения выполнен `code-search` по role matrix, dev-public/dev-bypass, UX-01 inventory и TEST walkthrough. Затем сверены:

- оба текущих screen inventory и acceptance/evidence docs в work3;
- §5.1 `LOCAL_DEV_AND_AGENT_TESTING.md` из основного worktree;
- три готовых TEST manifest:
  - `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T13-50-53Z/run-manifest.md`;
  - `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T14-48-56Z/run-manifest.md`;
  - `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T15-42-10Z/run-manifest.md`;
- фактический список `apps/webapp/src/app/**/page.tsx` в work3 и основном worktree;
- изменения между `e501709a3` и текущим основным HEAD, относящиеся к auth/dev roles и UX testing canon.

Сервер, БД и скриншоты не изменялись.

## 2. Route-file traceability

### Результат: PASS, 150/150

| Allocation                                                                     | Page files |
| ------------------------------------------------------------------------------ | ---------: |
| `/app/doctor/**`                                                               |         78 |
| `/app/settings` + `/app/settings/patient-home`                                 |          2 |
| `/app/admin/promo` legacy redirect                                             |          1 |
| `/app/patient/**`                                                              |         49 |
| `/book/**`                                                                     |         12 |
| `/` + `/legal/**`                                                              |          3 |
| `/app`, `/app/tg`, `/app/max`, `/app/auth/email-setup`, `/app/contact-support` |          5 |
| **Всего**                                                                      |    **150** |

Проверка дала `150` page files и в work3, и в текущем основном worktree. `comm` не нашёл ни добавленных, ни удалённых page paths между деревьями. Исправленное распределение `/app/admin/promo` в specialist family 13 устраняет прежний единственный traceability gap. Повторного route-file blocker нет.

Ограничение PASS: page-file traceability не покрывает новые материальные auth-состояния, реализованные route handlers/query state без нового `page.tsx`. В частности, specialist registration через `/api/auth/dev-public?view=registration` должна быть добавлена в UX inventory как отдельное состояние `/app`, хотя число page files остаётся 150.

## 3. Что в текущих inventory устарело

### 3.1 Общие предпосылки

1. Утверждение, что DEV DB содержит реальные ПДн и доступна только read-only, больше не является каноном. Текущий DEV — изменяемая UX-песочница; TEST в неё не копируется, pending migrations применяются к существующей базе через `migrate-dev.sh`.
2. Schema blocker `app.staff_user_has_password_credentials(uuid) missing` устранён обновлением DEV из TEST и применением миграций. Все patient statuses, помеченные только этим blocker, должны быть перепроверены, а не переноситься как текущий факт.
3. Методика старого прохода знает только `dev:doctor` и `dev:admin`. Текущий канон различает:
   - `dev:doctor` — regular specialist;
   - `dev:clinic-admin` — organization owner/clinic admin;
   - `dev:admin` — platform global admin с минимальным assistant membership;
   - `dev:client` — patient;
   - `dev-public` и `dev-public?view=registration` — две чистые anonymous/auth поверхности.
4. Старые `.claude/screenshots/SAAS-UX-01-*` и их `UX01_EVIDENCE_MANIFEST.md` — pre-refresh evidence. Их нельзя использовать как финальную current role matrix даже там, где файлы ещё локально существуют.
5. Baseline source commit `e501709a3` остаётся пригодным для route inventory, но уже не является current runtime/auth baseline. Документы должны отдельно указывать current app HEAD и commit каждого screenshot run.

### 3.2 Specialist inventory

- Access model нужно разделить на regular doctor, clinic admin и global admin, а не описывать их через прежние doctor/admin sessions.
- Статусы `Today`, `patients`, `schedule`, `communications`, CMS/LFK, clinic members/settings больше нельзя оставлять только как «не снимали из-за real PII»: TEST fixture evidence уже существует для clinic-owner A/B.
- Старый screenshot schedule setup under doctor остаётся историческим наблюдением. Его надо заново проверить именно через `dev:doctor`; TEST owner-профили не доказывают regular-doctor permission boundary.
- System/global pages требуют нового `dev:admin` прохода. Старые удалённые global screenshots не заменяют его.
- Assistant присутствует в requirements, но отсутствует как отдельный dev role slice и не имеет законченного capability contract. Для UX-01 нужен явный documented exclusion/`needs-decision`, иначе independent gate «no role omitted» остаётся двусмысленным.

### 3.3 Patient/public inventory

- Раздел `/app` не описывает новый явный specialist registration state с полями email, password, specialist name и organization name.
- Все patient business surfaces, ранее заблокированные schema mismatch, подлежат живому повторному проходу в DEV.
- Public landing/login теперь имеют актуальное desktop TEST evidence. Старое утверждение «landing pair deleted, NOT VISUALLY VERIFIED» больше не отражает всю доступную базу.
- Patient и registration по-прежнему не имеют актуального полного набора.

## 4. Покрытие готовыми TEST-наборами

Все готовые TEST PNG — desktop/full-page captures шириной `1440`; mobile evidence в этих трёх run отсутствует. Размер отличается от нового стандартного `1480x1024`, но это всё равно пригодное актуальное desktop evidence. Поскольку §5.1 прямо называет этот набор уже собранным, повторная desktop-съёмка тех же staff-состояний не нужна только ради разницы viewport; mobile shell/navigation всё равно нужно снять в DEV.

### 4.1 Первый run: 40 PNG

- 2 public: landing и clean login;
- 38 staff: 19 парных A/B состояний clinic-owner/clinic-admin;
- staff coverage: Today, patients, schedule, communications chats/broadcasts, CMS content/sections/library, LFK catalogs, clinic members/settings.

Профили A/B имеют owner/clinic-admin membership и specialist context. Поэтому они подтверждают combined clinic-owner/clinical workspace и tenant A/B states, но **не** являются isolated regular-doctor proof.

### 4.2 Narrow replay: 12 PNG

- исправленное legal-empty Today и отсутствие sidebar badge;
- canonical past/future schedule calendar/list;
- KPI finding этого run затем superseded финальным KPI replay.

### 4.3 KPI replay: 4 PNG

- финальные normal/empty past/future schedule list states;
- Clinic A: только собственные fixture rows и согласованные KPI;
- Clinic B: нулевые KPI и legal-empty list;
- findings отсутствуют.

### 4.4 Как учитывать superseded evidence

- `10-*-today-finding.png` первого run не является current Today result; current result — `10-*-today-empty.png` второго run.
- legacy appointments future/past findings первого run не являются canonical schedule proof; использовать canonical schedule evidence второго/третьего run.
- schedule KPI findings второго run superseded четырьмя PNG третьего run.
- references finding первого run остаётся finding, не valid product-state verification.

## 5. Матрица ролей: covered vs missing

| Slice из §5.1  | Готовое evidence                                       | Статус                       | Что ещё нужно                                                                                                                                                                           |
| -------------- | ------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public         | TEST landing + clean login, desktop                    | **PARTIAL**                  | Mobile landing/login в новом role-matrix run; зафиксировать отсутствие session.                                                                                                         |
| Registration   | Нет                                                    | **MISSING**                  | Desktop + mobile `/api/auth/dev-public?view=registration`; без submit, если мутация не нужна для состояния.                                                                             |
| Patient        | Нет актуального полного набора                         | **MISSING**                  | DEV desktop: home, appointments, treatment/program, profile/settings; mobile минимум shell/navigation и ключевые состояния. Schema blocker больше не использовать.                      |
| Regular doctor | TEST owner A/B не является isolated doctor             | **MISSING**                  | DEV `dev:doctor`: Today, patients, schedule, communications, content/LFK; desktop + mobile shell; явно доказать отсутствие clinic/global nav.                                           |
| Clinic admin   | TEST owner A/B: doctor set + members/settings, desktop | **PARTIAL / strong desktop** | DEV mobile shell/navigation; явно зафиксировать наличие clinic management и отсутствие global-admin sections. При необходимости один DEV desktop nav capture для точного role boundary. |
| Global admin   | Нет актуального полного набора                         | **MISSING**                  | DEV `dev:admin`: doctor set + analytics, system-health, audit-log, global settings/integrations; desktop + mobile shell/navigation.                                                     |

Дополнительные роли/tiers:

- Assistant: screen capability contract не определён и отдельного dev token нет. Зафиксировать как explicit UX-01 exclusion/UX-02 decision item, не притворяться, что regular doctor evidence его покрывает.
- Onboarding patient: не отдельный §5.1 login slice. Его состояния нужно оставить в patient inventory и проверять там, где они materially отличаются от full patient.
- Public booking и token activation: не заменяют role slices; существующие route families остаются в factual inventory и могут использовать отдельное representative evidence.

## 6. Точные правки, необходимые для закрытия UX-01

### A. Сначала собрать недостающее evidence

1. Создать новый `.claude/screenshots/UX-ROLE-MATRIX/<UTC>/` с отдельными профилями/manifest для `public`, `registration`, `patient`, `doctor`, `clinic-admin`, `global-admin`.
2. Не переснимать готовые TEST desktop A/B surfaces без продуктовой причины; ссылаться на три существующих manifests как imported TEST evidence.
3. В DEV снять отсутствующие role boundaries и mobile shell/navigation по §5.1.
4. Для каждой роли manifest должен содержать URL, role/token label без секретов, viewport, commit SHA, state (`normal`, `empty`, `finding`, `blocked`) и отсутствие/наличие role-specific navigation.
5. Ошибку, login redirect, forbidden или бесконечный loading оставлять finding, не считать verified screen.

### B. Обновить `SCREEN_INVENTORY_SPECIALIST.md`

1. Переписать method/runtime preamble на current DEV/TEST model и новые role tokens.
2. Разнести access table на regular doctor / clinic admin / global admin; assistant оставить explicit `needs-decision`.
3. Для families 1, 2, 5, 6, 7–17, 21–22 добавить ссылки на соответствующее актуальное TEST evidence и отделить valid, empty, finding и superseded states.
4. Для global families 23–30 сослаться на новый DEV global-admin run.
5. Удалить current blocker про missing DB function и запрет DEV writes; оставить его только в historical note.
6. Перепроверить и обновить schedule setup role mismatch через isolated `dev:doctor`.
7. Пересчитать coverage summary по актуальным manifests, не суммируя superseded PNG.

### C. Обновить `SCREEN_INVENTORY_PATIENT_PUBLIC.md`

1. Добавить отдельное material state `Registration` под общей `/app` page/auth family и точный dev entrypoint.
2. Заменить public visual status ссылками на актуальный TEST desktop и новый DEV mobile run.
3. Повторно пройти patient minimum matrix; заменить schema-blocked statuses реальными normal/empty/finding results.
4. Сохранить как отдельные gaps valid invite token, miniapp signed init-data, payment/write states и multi-organization patient state, если для них всё ещё нет безопасного fixture.
5. Пересчитать evidence totals.

### D. Пересобрать acceptance/evidence docs

1. В `UX01_ACCEPTANCE.md` сохранить PASS `150/150`, добавить non-page material auth state `Registration` и явный assistant exclusion/decision item.
2. `UX01_VISUAL_ATTEMPT_LEDGER.md` пометить historical/pre-refresh; добавить ссылки на новые role manifests либо заменить его current ledger.
3. `UX01_EVIDENCE_MANIFEST.md` пересобрать из:
   - трёх готовых TEST manifests;
   - нового DEV `UX-ROLE-MATRIX` manifest;
   - явной таблицы superseded findings, которые не входят в valid totals.
4. Старые `SAAS-UX-01-*` не считать current evidence и не смешивать с новым run.
5. Обновить `CURRENT_STATE_BASELINE.md` и `LOG.md`: DEV sandbox готова, migrations applied, roles live-smoked, current role entries зафиксированы.

### E. Повторить independent audit

Fresh auditor должен независимо подтвердить:

- 150/150 route allocation;
- registration как material non-page state;
- все шесть §5.1 slices либо valid evidence, либо точный documented blocker;
- role/nav boundaries doctor vs clinic-admin vs global-admin;
- отсутствие stale schema/PII assumptions;
- отсутствие двойного счёта superseded TEST evidence;
- соответствие screenshot paths/manifests/commit SHA;
- hypotheses по-прежнему не выданы за owner decisions.

Только новый PASS может закрыть прежний `UX01_INDEPENDENT_AUDIT.md = FAIL`; correction record сам по себе verdict не меняет.

## 7. Blockers и остаточные риски

### Текущие blockers

- **Нет внешнего/операционного blocker:** DEV обновлена, миграции применены, роли доступны.
- **Есть completion blocker:** недостаёт ролевых screenshots и документального reconciliation, перечисленных выше.

### Остаточные product risks, не требующие остановки UX-01

- Assistant capability/screen matrix не определена.
- Multi-organization patient fixture/state не подтверждён текущими manifests.
- Valid invite activation, custom branding/domain и write/delivery flows относятся к следующим UX stages и не должны искусственно производиться ради UX-01.
- Ready screenshots runtime-only и игнорируются git; долговечность handoff обеспечивают manifests и локальные канонические пути, но обычный clone PNG не получит. Это нужно явно сохранить в evidence policy.

## 8. Проверки

```text
work3 page.tsx count: 150
main page.tsx count: 150
page-path diff work3 vs main: empty
ready TEST PNG: 40 + 12 + 4
ready TEST viewport: desktop/full-page, width 1440; mobile PNG absent
```

Application tests/lint/typecheck не запускались: изменён только review-документ, application code не менялся.
