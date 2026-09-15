# Л4 — уведомление клиники о новой заявке: отчёт кандидата 15.09.2026

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8 и §10, очередь п. 4.

## Что сделано

- `LeadsService.submit()` после успешного создания заявки запускает уведомление, поэтому эффект общий для любой двери создания, а не привязан к будущему public route Л3.
- Получатели выбираются по `organization_id` созданной заявки: только активные membership `owner`/`admin` этой клиники. Глобальные `admin_telegram_ids`, `admin_max_ids` и `admin_phones` не читаются.
- Использован существующий `notifyDoctorPatientMessageToStaff` с его channel preferences, bindings, web-push availability и `reportEmptyAudience`; отдельный topic/settings/UI не создавался. У существующего topic `doctor_patient_messages` нет новой настройки для этой работы.
- В `relayOutbound` для Telegram, MAX и web push передаётся `organizationId` заявки; integrator получает tenant principal и не может считать отправку платформенно-глобальной.
- Нейтральное безопасное умолчание сообщения: «Новая заявка», переход `/app/doctor/communications?tab=leads`.

Код: `2d52b6b7b feat(leads): notify clinic staff of new lead`.

## Проверки

Целевой прогон через общий замок:

```text
Test Files  1 passed (1)
     Tests  2 passed (2)
  Duration  293ms
[2026-09-15T06:58:08+03:00] pid=2181658 RELEASED test lock (rc=0, 2s)
```

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts"
```

Слепая поломка: из MAX-вызова `relayOutbound` временно удалён `organizationId: input.organizationId`. Тот же locked-прогон покраснел:

```text
Test Files  1 failed (1)
     Tests  2 failed (2)
AssertionError: expected "vi.fn()" to be called with arguments
-     "organizationId": "org-1",
+     "messageId": "message-doctor_patient_messages:max:org-1-doctor:max-1",
```

Временная поломка откачена; зелёный прогон выше выполнен после отката.

DEV preflight через общий замок, read-only transaction (`bcb_webapp_dev`):

```text
BEGIN
a0000000-0000-4000-8000-000000000001|1
ROLLBACK
```

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -A -t -c \"BEGIN READ ONLY; SELECT organization_id::text || '|' || count(*)::text FROM public.be_organization_members WHERE status = 'active' AND role IN ('owner', 'admin') GROUP BY organization_id HAVING count(*) > 0 ORDER BY organization_id LIMIT 2; ROLLBACK;\""
```

`pnpm exec tsc -p apps/webapp/tsconfig.json --noEmit` exits 1 on pre-existing, out-of-scope errors in the merge worktree:

```text
apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.ts(184,33): error TS2554: Expected 1 arguments, but got 0.
apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts(73,13): error TS2339: Property 'kind' does not exist on type 'MergeDependentConflictError'.
apps/webapp/src/infra/repos/pgPlatformUserMerge.ts(8,3): error TS2724: '@bersoncare/platform-merge' has no exported member named 'MergePlatformUsersOutcome'.
```

Ошибок из файлов Л4 после исправления порядка DI нет. ESLint по семи затронутым файлам: `eslint_exit=0`.

## Вопросы владельцу

- `relayOutbound` по действующему `INTEGRATOR_CONTRACT.md` диспатчит синхронно и не пишет `outgoing_delivery_queue`, тогда как brief требует и именно этот механизм, и запись очереди; рекомендую выбрать один oracle: для durable queue — `app.enqueue_outbound_message`, безопасное умолчание текущего кандидата — точный `relayOutbound` из §8.8 без второго контура.
- Нужны ли отдельные wording, канал или opt-out для заявок; рекомендую не расширять поверхность до решения, безопасное умолчание — «Новая заявка» через уже существующие preferences `doctor_patient_messages`.
- Считать ли активного membership `owner` администратором для этой аудитории; рекомендую да, безопасное умолчание кандидата — `owner` и `admin`, иначе владелец клиники может не узнать о первой заявке.

## НЕ СДЕЛАНО

- Сквозной live-прогон «публичная заявка создана → уведомление принято» не выполнен: route Л3 существует только в независимой ветке `wt/leads-public-intake`, в текущем кандидате его нет.
- Проверка «после relay появилась строка `outgoing_delivery_queue` с organization_id этой клиники» не может быть честно выполнена: `relayOutboundRoute.ts` вызывает `dispatchPort.dispatchOutgoing()` напрямую, а не очередь. Запись о такой проверке была бы ложной.
- Новые migrations, table grants, канал, settings topic, UI и глобальные admin lists не добавлялись.
