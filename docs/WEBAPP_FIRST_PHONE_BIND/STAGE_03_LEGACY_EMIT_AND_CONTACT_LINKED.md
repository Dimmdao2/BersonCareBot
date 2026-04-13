# Этап 3: Legacy M2M — `emit`/202, `contact.linked`, outbox/worker

## Контекст

После перевода **phone bind** на одну TX путь **`POST /api/integrator/events`** с типом `contact.linked` для этой цепочки не должен быть основным. Остаётся:

- **Исправление парсинга ответа** для **оставшихся** вызовов `webappEventsClient.emit`: **202 без `body.ok === true`** = неуспех; невалидный JSON = ошибка и лог.
- **Идемпотентность** обработки `contact.linked` на webapp, пока в outbox есть хвосты или пока не выключен продюсер — без двойного неконсистентного merge.
- **Контракт ответов** webapp: не отдавать integrator «успех», если телефон фактически не применён к пользователю по binding (различие 503 transient vs 422 семантика).

Файлы: `apps/integrator/src/infra/adapters/webappEventsClient.ts` · `apps/webapp/src/app/api/integrator/events/route.ts` · `apps/webapp/src/modules/integrator/events.ts` · `apps/integrator/src/infra/db/repos/projectionFanout.ts` · worker projection (см. план Cursor §Legacy).

## Результат этапа

- [ ] Для **не-телефонных** M2M: тест на 202 + `{ ok: false }` / без `ok` → integrator **не** завершает проекцию как успех.
- [ ] `contact.linked`: идемпотентность и корректные коды до полного удаления продюсера с phone path.
- [ ] Документировано, какие event types ещё идут через emit/worker и до какой даты/версии.

## Чек-лист аудита (этап 3)

- [ ] Юнит/интеграционный тест: 202 без успешного тела → неуспех для integrator.
- [ ] 200/202 с `{ ok: true }` → успех.
- [ ] Повтор старого `contact.linked` после TX-cutover не портит строку, уже обновлённую bind.
- [ ] Нет бесконечного ретрая на семантических 422 (конфликт номера / integrator id).
- [ ] `pnpm run ci`.
