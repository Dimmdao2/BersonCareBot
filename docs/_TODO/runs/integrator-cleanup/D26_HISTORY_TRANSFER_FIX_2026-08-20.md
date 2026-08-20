# D26 — подтверждение полного переноса истории в support-merge

## Итог

На текущей ветке finding 2 уже закрыта продуктовым изменением из `39a8d0d41`
(`fix(d26): gate both accounts and transfer medical history (#984)`), которое входит
в историю этого checkout до начала данного прохода. Поэтому новой второй transfer-path
или дублирующей правки не создавалось: существующий единый проход
`transferMedicalHistoryForMerge` в
`packages/platform-merge/src/pgPlatformUserMerge.ts` остаётся точкой переноса для
manual/support merge и вызывается из `mergePlatformUsersInTransaction`.

Противоречие с brief снято фактической проверкой: oracle из audit commit `bdc1f11c8`
на этом checkout зелёный (`4 passed`), хотя audit фиксировал его красным на прежнем
кандидате. Следовательно, повторно добавлять те же SQL-transfer'ы означало бы
нарушить правило одного общего прохода (AGENTS.md §5).

## Таблицы, добавленные в единый transfer list

`MEDICAL_HISTORY_RECORDS` (добавлено в `39a8d0d41`, присутствует в текущем
`pgPlatformUserMerge.ts`) переносит от duplicate к target следующие относящиеся к
finding 2 записи:

- `clinical_visit` — визиты;
- `clinical_complaint`, `clinical_diagnosis`,
  `clinical_anamnesis_trauma`, `clinical_anamnesis_illness`,
  `clinical_anamnesis_lifestyle`, `doctor_notes` — клиническая карта и анамнез;
- `patient_bookings`, `be_appointments` — история записей/приёмов;
- `treatment_program_instances` — назначенные врачом программы и их журналы;
- `support_conversations`, `program_item_discussion_messages`,
  `program_item_discussion_reads` — переписка и discussion; reads сначала
  дедуплицируются по уникальному ключу;
- `patient_specialist_links` — привязки пациента к клиникам/специалистам; при
  конфликте активной привязки к тому же специалисту duplicate-связь сначала
  завершается, после чего все ссылки переводятся на target.

Это ровно категории из `IDENTITY_AND_MERGE_SCHEME.md` §5.2/§5.2a и право поддержки
из §5.8: визиты, записи, медицинские/анамнестические данные, программы, обсуждения
и clinic links переносятся в любом направлении. Support reverse merge использует
`reason: 'manual'`, поэтому переданная в oracle новая учётная запись становится
`duplicate`, а старая — `target`; тот же общий transfer переносит `clinical_visit`
обратно на старую запись.

## Проверки

После `pnpm install --frozen-lockfile`:

```text
pnpm --dir apps/webapp exec vitest --run --project=unit src/infra/accountMergeMedicalHistory.unit.test.ts
Test Files  1 passed (1)
Tests  4 passed (4)
Duration  607ms
EXIT=0
```

```text
pnpm --dir apps/webapp typecheck
> @bersoncare/webapp@0.1.0 typecheck
> tsc --noEmit
EXIT=0
```

The workspace installation does not build ignored package artifacts. The broad unit-project
run initially resolved 52 unrelated suite imports unsuccessfully because
`@bersoncare/db-principal`, `@bersoncare/platform-merge`, and
`@bersoncare/operator-db-schema` had no built entrypoints. After:

```text
pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build
EXIT=0
```

the required targeted unit-project oracle remained green (the `support account merge`
case logged its manual reverse merge and completed successfully). No production or test
source changed in this pass; generated package output is ignored.

## NOT DONE

- Finding 1: `assertAutomaticMergeHasNoMedicalHistory` and its call site were not
  touched. The owner rejected that finding; current conflict-only gate remains intact.
- Finding 3 / §5.4: 2FA condition, Cyrillic-name priority, and channel/OAuth binding
  rules are separate scope and were not changed.
- The audit's non-blocking thin-route observation was not changed.
