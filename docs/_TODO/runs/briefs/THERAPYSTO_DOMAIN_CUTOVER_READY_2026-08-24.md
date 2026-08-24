# Brief: подготовить доменное переключение Therapysto без активации

## Роль и authority

Ты implementation-worker. До каждого действия выполняй карту заголовков `AGENTS.md`, затем читай относящийся
раздел. Обязательные источники: `AGENTS.md` §1, §7, §9, §10, §24; `README.md`;
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`; `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`;
`deploy/HOST_DEPLOY_README.md`;
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2, §1.2a, B7, B8, C5a, Stage D и
Stage E; `SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §1–§3.

Источник оракула — `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`: «`test.bersoncare.ru` продолжает работать на прежнем адресе.»

Дополнительное прямое решение владельца в текущем ходу: подготовить доменное переключение полностью в отдельной
ветке, независимо проверить, но не вливать и не применять, пока владелец не даст отдельную команду.

Точные требования плана:

> «`B7` Выпустить и продлевать сертификат, который явно содержит `therapygo.ru` и `*.therapygo.ru`; wildcard сам
> по себе apex не покрывает. Описать rollback; UI/lifecycle automation не строить.»

> «`B8` Ручное подключение своего домена клиники [...] Первый и пока единственный случай —
> `app.bersoncare.ru`. Плюс редирект `bersoncare.therapygo.ru` → домен клиники [...]»

## Цель хода

В этой отдельной ветке подготовь полный, безопасный к запуску оператором пакет будущего доменного переключения.
После merge по отдельной команде владельца оператор должен суметь задать утверждённые TEST-домены, проверить
предусловия, отрендерить/проверить nginx и TLS/DNS ожидания, выполнить переключение штатными существующими
точками и откатить его. Сейчас ничего не активируется.

## Обязательный объём

1. Сначала измерь текущие deploy seams и параметризуй существующие, если они могут нести новую схему:
   `deploy/host/apply-test-nginx-webapp.sh`, `deploy/nginx/bersoncarebot-webapp.vhost.template.conf`,
   `deploy/host/setup-nginx-tls.sh` и существующие health/deploy hooks. Не создавай второй конкурирующий путь,
   если можно расширить эти точки.
2. Сделай TEST-host map явным вводом, а не hardcode. Production topology фиксирован планом (`therapysto.ru`,
   `admin.therapysto.ru`, `therapygo.ru`, `*.therapygo.ru`, `bersoncare.therapygo.ru`, `app.bersoncare.ru`), но
   точные TEST-аналоги владелец ещё не утвердил как значения. Скрипт обязан отказать при пустых/дублирующихся/
   синтаксически неверных host values и не должен угадывать их.
3. Подготовь nginx-конфигурацию одного webapp для `staff`, `platform_admin`, `patient_default`, технического
   branded host и custom clinic host. Host должен доходить до уже существующего resolver без подмены. Технический
   branded host редиректит на custom host. Неизвестные host не получают platform fallback.
4. Подготовь preflight, который до любых изменений проверяет: host map, DNS expectation, наличие/покрытие
   сертификатов (apex и wildcard считаются отдельно), требуемые runtime origins и возможность отката. Проверка
   должна иметь чистый offline/testable режим без сетевых и серверных изменений.
5. Подготовь минимальный ежедневный check DNS resolution + certificate expiry и точные команды его будущего
   включения только через `cronport`. Сам cron не устанавливай.
6. Обнови действующий deploy/runbook: пошаговый cutover, smoke по каждой поверхности, BersonCare branded journey,
   сохранение/восстановление предыдущего nginx/env состояния, rollback criteria и точные команды. Не объявляй
   `B7`, `B8`, `C5a`, `D1`–`D3` или runtime `C5` закрытыми — они закрываются только живой активацией.
7. Добавь поведенческие/рендеринг проверки для повторяемых контрактов; shell syntax и targeted checks должны быть
   зелёными. Не пиши тесты, которые лишь ищут строки исходника.
8. Запиши прямое решение владельца об отдельной невливаемой ветке в активный implementation plan; runtime-пункты
   оставь открытыми.

## Жёсткие запреты

- Не вливай ветку никуда и не пушь.
- Не меняй DNS, TLS, nginx, systemd, env, БД, settings, cron или текущий TEST runtime.
- Не трогай PROD и хост `135.106.162.170`.
- Не запускай deploy, certbot, миграции, временную БД или исторический replay.
- Не придумывай значения TEST-доменов и не меняй существующий `test.bersoncare.ru` в общей ветке.
- Не трогай UI, Track D delivery SQL/roles и продуктовый surface resolver: этот этап только deploy/cutover readiness.
- Не строй self-service DNS/TLS или generic domain lifecycle.
- Не завершай ход в ожидании фонового процесса. Коммит обязателен до ответа.

## Приёмка worker

- Покажи diff всей ветки от базового `5272a0761`.
- Запусти только подходящие targeted/offline проверки; полный CI не нужен, если нет repo-level runtime change.
- Убедись, что дерево чистое, и закоммить точные пути сообщением с `#787`, причиной, доказательством и явным
  «не активировано».
- В отчёте перечисли: что оператор сможет сделать после merge, что намеренно не произошло сейчас, команды
  проверок, их результаты и commit SHA.
