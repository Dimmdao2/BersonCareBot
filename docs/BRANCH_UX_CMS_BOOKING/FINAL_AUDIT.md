# Финальный аудит ветки UX / CMS / Booking

**Дата:** 2026-03-31  
**Аудитор:** agent (Cursor)  
**База сравнения кода:** `origin/main...HEAD` (локальная ветка `main`, **15 коммитов** впереди `origin/main`). Удалённой ветки `feature/ux-cms-booking` в `git branch -a` нет — фактический кандидат на push/merge — текущий `HEAD` после синхронизации с командой.

**Примечание по объёму diff:** коммит `origin/main` (`c0df0d8`) уже включает фазы 0–2 (чистка, CMS/media, нативная запись). Дифф `origin/main...HEAD` охватывает **только фазы 3–4** и обновления документации (~42 файла, +2746/−267 строк). Полный объём работ по `PLAN.md` / `AGENT_LOG.md` отражён **состоянием репозитория на `HEAD`**, а не одним git-diff к `origin/main`.

---

## 1. Сверка с `PLAN.md` и `AGENT_LOG.md`

| Фаза | Задачи в плане | Статус в AGENT_LOG |
|------|----------------|---------------------|
| 0 | 0.1–0.8 | Все **done** |
| 1 | 1.1–1.13 | Все **done**; аудит фазы 1 — **pass** (`AUDIT_PHASE_1.md`) |
| 2 | 2.1–2.24 (блоки A/B/C) | Реализация сгруппирована в записях 2.1–2.6 + блок **Phase 2 remediation**; критичные пункты `AUDIT_PHASE_2` закрыты remediation-коммитом на базе (`overlap`, `cancelling`, timezone и т.д. по логу) |
| 3 | 3.1–3.6 | Все **done**; **AUDIT_PHASE_3** — **pass** после rework |
| 4 | 4.1–4.4 (план) | В логе детализация 4.1–4.6 + **Phase 4 rework**; **AUDIT_PHASE_4** — **approve** после rework |
| 5 | Личный помощник (отдельно) | Вне scope текущей ветки по плану |

**Документация лога:** разделы «Аудит Фазы 0» и «Аудит Фазы 2» в `AGENT_LOG.md` заполнены; добавлен блок **Remediation: TODO и аудиты**.

---

## 2. Автоматические проверки

| Критерий | Результат |
|----------|-----------|
| `pnpm run ci` | **Зелёный** (lint, typecheck, integrator + webapp tests, build, audit --prod) — прогон 2026-03-31 после remediation TODO/audit |
| `console.log` в `apps/webapp/src` | **Не найдено** |
| Сборка Next (`next build`) | Успешна, маршруты `/app/patient/*`, `/app/doctor/*`, `/api/booking/*` присутствуют |

---

## 3. TODO / техдолг (после remediation)

Открытые задачи перенесены в [`TODO_BACKLOG.md`](./TODO_BACKLOG.md) с идентификаторами **`AUDIT-BACKLOG-NNN`** в комментариях кода (вместо «голых» `TODO`). При появлении GitHub-issue добавьте ссылку в таблицу backlog.

| Зона | ID | Статус |
|------|-----|--------|
| Рассылки / `resolveAudienceSize` | AUDIT-BACKLOG-010, 011 | open |
| Уведомления integrator/events | AUDIT-BACKLOG-020 | open |
| Appointments service (мост API) | AUDIT-BACKLOG-021 | open |
| Doctor layout (desktop sidebar) | AUDIT-BACKLOG-022 | open |
| Channel link notifications | AUDIT-BACKLOG-023 | open |
| pgUserProjection Rubitime email | AUDIT-BACKLOG-024 | open |

**Закрыто:** ссылка поддержки в OTP — `system_settings.support_contact_url` + `getSupportContactUrl()`; комментарий в `OtpCodeForm` снят.

---

## 4. Логирование вне webapp

- **`apps/integrator/src/kernel/orchestrator/resolver.ts`:** отладочный вывод для `callback.received` переведён на **`logger.debug`** (pino, уровень `LOG_LEVEL`). Прямых `console.log` в этом модуле нет.
- Скрипты `infra/scripts/*` с `console.log` — ожидаемо для CLI.

---

## 5. Навигация пациента

- По `navigation.ts` / фазе 0: из главной и шапки убраны **purchases**, **help**, **install** — соответствует логу.
- Маршруты `/app/patient/help`, `/app/patient/install` при прямом заходе показывают **полезный текст и ссылки** (без «Раздел в разработке»); не в основном меню пациента.
- **Покупки:** пустое состояние вместо моков (`0.8`).
- Битых ссылок в декларированных блоках главной по коду не выявлено; e2e-набор в CI зелёный.

---

## 6. Навигация врача

- `DoctorHeader`: пункты ведут на существующие маршруты (в т.ч. `clients?scope=…`, `broadcasts`, без отдельного «Подписчиков» — редиректы с legacy URL по логу фазы 3).
- `/app/doctor/references` не в меню; по прямому URL — краткое описание и ссылки на упражнения/CMS (не «заглушка в разработке»).

---

## 7. Booking: полный цикл

По коду и логам (фаза 2 + remediation на базе):

- **Создание:** API `POST /api/booking/create`, модуль `patient-booking`, синхронизация с Rubitime через integrator.
- **Подтверждение / уведомления:** события `booking.created` / M2M `booking-event`, уведомления в мессенджеры.
- **Напоминания:** в `recordM2mRoute.ts` — джобы 24h и 2h относительно слота, дедуп TTL 24h, тесты маршрута.
- **Отмена:** `POST /api/booking/cancel`, статусы `cancelling` / reconcile, обновление внешних систем по логу remediation.
- **Legacy:** `/app/patient/booking` → redirect в кабинет (`2.13` в истории коммитов).

Полная интеграционная проверка с реальным Rubitime/Google Calendar в этом аудите **не выполнялась** (нет стенда); автотесты и статический разбор — **OK**.

---

## 8. CMS: загрузка → просмотр → picker → предпросмотр

- Загрузка: multi-upload, progress, DnD, capture — по AGENT_LOG и тестам API.
- Просмотр: grid/table, lightbox, пагинация «ещё», копирование URL.
- Picker: Dialog/Sheet.
- Контент: `ContentPreview` + форма; `sort_order` убран из UI; **хаб** `/app/doctor/content` с кнопками «Новости» / «Мотивация» и отдельными маршрутами `/app/doctor/content/news`, `/app/doctor/content/motivation` (списки с DnD, глаз, действия). Список **разделов** — плоский список с тем же паттерном, что страницы контента (см. rework `REWORK_CLOSE_AUDIT_GAPS_REPORT.md`).
- **nginx / 413:** лимит `client_max_body_size` для vhost webapp задаётся **на сервере**; в репозитории — только runbook (`deploy/HOST_DEPLOY_README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`).

---

## 9. Мобильная адаптивность

- В изменениях фаз 3–4 и ранее активно используются `Sheet`/`Dialog`, адаптивные сетки, `md:`/`sm:` breakpoints, mobile-first для медиатеки (по логу фазы 1).
- **Итог:** по коду паттерны соблюдены; **полная** проверка «все экраны» без ручного прогона на устройствах **не гарантируется** — зафиксировать в релиз-чеклисте при необходимости.

---

## 10. Прочие замечания

- **`ClientProfileCard`:** блок «Карта пациента» — нейтральный текст о будущем разделе (без «заглушка / без API»).
- **Рассылки:** сегменты `inactive` / `sms_only` с приблизительной оценкой — задокументированы в UI (`AUDIT_PHASE_4` rework).

---

## Решение

**Merge** в `main` (и push в `origin`) после зелёного `pnpm run ci` на актуальном `HEAD`.

Оставшийся техдолг — по таблице в разделе 3 и [`TODO_BACKLOG.md`](./TODO_BACKLOG.md); закрытие — отдельными задачами с привязкой к GitHub при появлении тикетов.

---

## Команды для воспроизведения

```bash
git fetch origin
git diff origin/main...HEAD --stat
pnpm install --frozen-lockfile
pnpm run ci
```
