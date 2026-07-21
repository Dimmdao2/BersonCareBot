# ARCHIVED — Session handoff, 2026-07-17

**Superseded 2026-07-21. Не использовать как операционный runbook или источник текущего статуса.**

Проверка при архивировании:

- все перечисленные ниже commits уже являются ancestors текущей `feat/doctor-ui-rebuild`;
- перечисленных agent worktrees больше нет;
- текущие статусы находятся в taskdb и каноническом
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`;
- указанный ниже `deploy-test-saas.sh`/fresh-dump порядок устарел: обычные TEST updates являются code-only, а
  destructive reset требует отдельного owner gate и отдельного runbook.

Ниже сохранён исходный исторический снимок без превращения его в активное требование.

---

# Session handoff — BersonCare, 2026-07-17

Живой снимок для repo-lead `bersoncare` / Нео, чтобы подхватить контроль. План и статусы — в taskdb
(`node /home/dev/brain/tools/taskdb.mjs list bcb` / `waiting`). Здесь то, чего в taskdb нет: живые воркеры и гейты.

## Цель
Полностью рабочая система на ТЕСТЕ (мультитенант + UI + оплата + магазин/тарифы + два входа). Старый прод заморожен,
переключения нет. Канон решений: `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15/16/17.md`. Дайджест ночи и
вопросы владельцу: `docs/_TODO/NIGHT_2026-07-17_OWNER_DIGEST.md`.

## 🔴 Блокер №1 (в работе)
RLS-фикс #821: strict FORCE RLS молча ломает unprincipled db.select() → график исчезает, двойная запись. Владелец
одобрил (§8b плана `RLS_UNPRINCIPLED_READ_FIX_PLAN.md`): единый чокпоинт в `drizzle.ts`, FORCE не снимать.

## Живые воркеры (сессия интерактивного лида, привязаны к ней; коммиты в ветках — durable)
| Что | Ветка / коммиты | Статус | Гейт |
|---|---|---|---|
| RLS-фикс #821 | `worktree-agent-a74041b6d111a5cb0` — a2a5281cd (Phase1 чокпоинт), d8a08c47b (Phase3 companion), 25ea451ce (Phase2 тесты) | воркер дописывает отчёт | ждёт независимого аудита |
| RLS аудит (adversarial, read-only) | — | В ПОЛЁТЕ, вердикт ожидается | **критический гейт**: утечка между клиниками |

## Готовы к вливанию (отаудированы, HOLD до одной пачки)
| Карта | Ветка / коммит | Примечание |
|---|---|---|
| #812/#813 чат deep-link + карточка | `worktree-agent-a339e8076ce810785` a7aef0bbe/cdb3a0718/b28d189eb | мерджить ПЕРВОЙ |
| #814 панель «обзор и записи» | `worktree-agent-adc39a17204f951db` ac11719cd | мерджить ВТОРОЙ; конфликт в DoctorSupportInbox.tsx+conversations/route.ts → оставить ОБА элемента заголовка |
| #805 `/book/{slug}` | `worktree-agent-adeb597e357be04c2` d7ca9bfac..ea54b6ca1 | перед живым тестом нужен грант #817 |
| #829 город сбрасывает дни | `worktree-agent-aa4d5407071e1d8bc` 7d3076e63 | client-only |
| дизайн-ноты #562/#563/#565 | `worktree-agent-a8d6fc3032cbef8f3` acc6a40a5 | docs-only |

## Порядок после зелёного RLS-аудита
1. Влить RLS-ветку в `feat/doctor-ui-rebuild`.
2. Влить остальные ветки одной пачкой (порядок/конфликт см. выше), полный CI ОДИН раз.
3. #817 грант для `/book`.
4. Канонический свежий деплой на ТЕСТ (`deploy/host/deploy-test-saas.sh`, свежий дамп по `docs/OPERATIONS/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`).
5. Приёмка владельца.

## Ждёт владельца (не блокирует бэкенд-работу)
- 11 вопросов бэклога + ревью дизайнов волны (#751/#807/#808/#801/#806) — в дайджесте.
- Открытые вопросы по дизайн-нотам #562/#563/#565 (хранение цепочки/оплата, actor/attendee shape, scope-колонка).
- Онлайн-приём #215 и курсы #26 — владелец надиктует.
- 🔴 #818 (mock-оплата абонемента на проде без гейта), #832 (контакты записи-на-другого в чужую карточку).

## Мониторы/будильники этой сессии
- Monitor `btiarznlv` — смена статуса #783/#803, новые коммиты на feat, падение теста :6300.
- Приёмочная сессия владельца (#783/#803) простаивает со вчера — НЕ моя, не трогать её git.

## Каналы управления
- Задача лиду: `bash /home/dev/brain/host-orch/repo-leads/repo-lead-send.sh bersoncare "текст"`.
- Ответ владельцу в TG: `bash /home/dev/brain/host-orch/notify-owner.sh "текст"`.
- Правила: `docs/SHARED_TASKDB.md`, `AGENTS.md`, `.cursor/rules`, `docs/ORCHESTRATION_BINDINGS.md`. HARD: не пушить, прод не трогать.
