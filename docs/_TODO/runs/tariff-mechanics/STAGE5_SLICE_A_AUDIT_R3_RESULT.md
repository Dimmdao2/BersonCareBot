VERDICT: FAIL

Slice A нельзя закрыть: остаются два достижимых обхода `warmups`, один недостаточно чувствительный тест и одно нарушение scope.

## Completeness diff

| Механика | Независимая перепись | Diff к спискам workers |
|---|---|---|
| `external_calendar` | OAuth start/callback; четыре calendar-ключа shared settings; UI entry. Чтение status/calendars/settings не gated | Полностью совпадает, открытых путей не найдено |
| `patient_diaries` | Mood/feeling; symptom и LFK actions; doctor tracking POST; doctor LFK PATCH; purge; четыре signed events; четыре direct integrator writes; lazy materialisation diary/mood/home/snapshots | Corrections закрыли известные пропуски. Новых обходов не найдено |
| `patient_home_today` | 10 patient-home actions; 4 settings actions; 7 shared keys; скрытие nav и direct-page | Совпадает |
| `warmups` | Schedule/settings; 11 CMS actions; 7 `daily_warmup` actions; completion/video; reminder create/update/delete/actions; lazy presentation в home/go/web-push | Workers пропустили first-PWA onboarding и category toggle — оба открыты |
| `promo` | Doctor PATCH/refresh; shared key; patient action; reminder materialisation; treatment/reminders/go entry | Совпадает; existing active promo возвращается до gate |

## MUST FIX

1. Первая PWA push-подписка создаёт warmups reminder при `warmups=false`.

   [`subscribe/route.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token]-push/subscribe/route.ts:98) без entitlement вызывает `ensureWarmupsReminderOnFirstPwaPush`, а тот делает `createObjectReminder` в [`ensureWarmupsReminderOnFirstPwaPush.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:72). Сценарий достижим при первой регистрации PWA push. Нарушены 5.9 и канон §5.1: выключенная возможность не должна создавать данные.

2. Exemption `toggleReminderCategory` ложный и оставляет mutation bypass.

   Registry называет его category-only mutation, но `toggleCategory('lfk')` получает строку только по `category` без ограничения `linked_object_type IS NULL`: [`pgReminderRules.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:198). Warmups object-rule тоже имеет категорию `lfk`, поэтому прямой server-action может выбрать и изменить его при `warmups=false`. Нарушены 5.9, §5.1 и требование честности exemptions.

3. Sensitivity lazy diary materialisation неполная.

   Тест действительно краснеет, если сломать условие внутри `loadPatientDiaryWeekWellbeing`, но он вручную передаёт `materializeMissingTrackings: false`. Удаление entitlement decision из реальных callers — diary RSC, mood GET или Patient Home — тесты не заметят: callers тестами не вызываются. Следовательно worker claim подтверждён только для leaf-condition, не для полного защитного пути.

4. Изменён файл вне разрешённого §1 scope: [`check-s4-entitlement-coverage.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/scripts/check-s4-entitlement-coverage.ts:72). Изменение содержательно связано с array mechanics, но путь не разрешён обозначенной границей.

## Три sensitivity claims

1. Lazy diary materialisation — частично: конкретная worker mutation красит тест, но removal реального caller gate останется зелёным.
2. Doctor PATCH LFK diary row — да: тест вызывает реальный handler и ожидает 403; без guard получает 200.
3. Patient-home `daily_warmup` writes — да: тест вызывает семь реальных actions; удаление warmups-helper приводит к `{ok:true}` и реальным mocked writes.

## Fixture claim

Подтверждён. Production guard:

- разрешает shortcut только для точного `warmups`;
- для `daily-warmups` вызывает `contentSections.getBySlug`;
- требует `systemParentCode === 'warmups'`.

Тестовая fixture в [`tariffMechanics.route.test.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].route.test.ts:452) честно возвращает `{systemParentCode: 'warmups'}`. Тест не был ослаблен для прохождения.

## Что верно

- Чтение и export для рассматриваемых механик не получили read-entitlement gate.
- Existing diary trackings/entries читаются без lazy UPSERT.
- Existing active promo остаётся доступным при выключенном `promo`.
- Patient Today content не скрывается; отключается только materialisation warmup presentation.
- Guarded UI/CMS/diary/promo flows показывают action-specific backend wording.
- Migration `0275`, mechanic key list, seat chokepoint, patient-file write port, billing, support, patient-card/app не менялись ни одним из четырёх first-parent slice-коммитов.
- Reflow плана не потерял требований: добавлен correction paragraph, а 7.2 только свернут из списка в строку.

## Scope/stat

Обычный `6143^..92c4` загрязнён параллельными merge-in и показывает 142 файла, `+5617/-777`.

Проверка четырёх собственных slice patches:

- `6143c7082`: 23 файла, `+572/-61`
- `8ecb98f18`: 44 файла, `+1307/-117`
- `692e00f05`: 49 файлов, `+1557/-268`
- `92c4d237f`: 3 файла, `+24/-4`
- Итого: 98 уникальных файлов, `+3460/-450`

Итоговый merge-tree против последнего canonical parent: 120 файлов, `+4534/-726`; там присутствует более ранняя работа этапов 1–4, поэтому forbidden-path проверка выполнена отдельно по четырём slice patches.

## Команды и результаты

- `pnpm --filter webapp typecheck` — exit 0.
- `pnpm --filter webapp lint` — exit 0; `check-drizzle-journal-sync: OK`.
- Webapp affected tests — 9 файлов, 44/44 passed.
- Integrator affected test — 1 файл, 2/2 passed.
- Итого — 10 файлов, 46/46 passed.
- Full CI не запускался.

## Что осталось непроверенным

- DEV/TEST runtime и живой UI.
- Реальная PostgreSQL-проба двух найденных reminder bypasses; статический call path однозначен.
- Integrator typecheck/lint повторно не запускались — mission требовала webapp commands.
- Mutation edits я не выполнял из-за запрета менять файлы.

## Чистота дерева

Формально дерево не clean. Финальный `git status --short` совпадает с начальным: десять tracked env-файлов остаются modified character devices. Аудит файлов не менял и новой грязи не добавил, но подтвердить требуемое clean tree нельзя.