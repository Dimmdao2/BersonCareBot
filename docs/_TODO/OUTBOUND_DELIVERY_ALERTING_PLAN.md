# План: громкий алертинг на отказ доставки (email/SMS/любой провайдер)

Статус: APPROVED-DIRECTION владельцем 2026-07-21 · автор: оркестратор (Opus)
Execution authority/status: subordinate artifact of
`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, taskdb `#950`; this file does not define a parallel DAG.
Инцидент-триггер: 20.07 13:19 МСК — 21.07 кончился тариф отправки на хостинге → SMTP `535 EAUTH`,
`/api/bersoncare/send-email → 500`, письма (в т.ч. коды регистрации) не уходили **сутки+**, а система
**молчала**: ни пуша, ни ТГ, ни МАКС; утренний дайджест слал зелёное «всё ок».

## Корень (диагноз по коду+проду)
Движок алертинга ЖИВ (зелёные дайджесты приходят) — но этот класс сбоя ему **невидим**:
1. **Нет критического сигнала на отказ отправки.** `modules/operator-health/criticalHealthSignals.ts`
   мониторит БД / integrator API / очереди projection·delivery·push-outbox / бэкапы / пробы / вебхуки /
   изоляцию — но НЕ «email/SMS send падает».
2. **Синхронный OTP-путь мимо очереди.** `POST /api/bersoncare/send-email` (integrator, `sendEmailRoute.ts`,
   конфиг `config/smtpOutbound.ts` из БД `system_settings.smtp_outbound`) — прямой вызов, 500 не становится
   `dead` в outgoing-delivery → сигнал очереди не срабатывает.
3. **Проба не покрывает почту/SMS.** `apps/integrator/src/app/operatorHealthProbeRunner.ts` пробит только
   Telegram `getMe` и Google Calendar.
4. **Дайджест ложно-зелёный** — по тем же причинам (сбой не в матрице сигналов).
5. Рассыл `modules/operator-alerts/dispatchOperatorAlert.ts` веером в telegram+max+web_push (получатели
   `admin_telegram_ids`/`admin_max_ids` + staff web-push). **SMS-канала нет.** Дедуп плоский 24ч (нет эскалации).

## 🟩 Решения владельца (2026-07-21) — канон этого плана
- **Каналы:** орать во ВСЕ разом — **web_push + Telegram + MAX + SMS** (SMS только если подключён провайдер).
  «Такие сбои надо орать везде.» Веер best-effort, независимые каналы: что живо — то доставит.
  (Нео/notify-owner НЕ используем — алерт нативный в продукте.)
- **Каденция критического инцидента:** **сразу → повтор через 1 час → далее каждое утро в системном отчёте,
  пока не починю.** Пока не resolved — отчёт держит инцидент КРАСНЫМ, не зелёным.
- **Визуал тяжести:** отказ ЛЮБОГО провайдера доставки — НЕ жёлтый треугольник, а **красный «!» + иконка
  «стоп»/перечёркнутый круг**, громкий алерт. Обычные warn остаются жёлтыми.

## Скоуп (по приоритету; всё строим и проверяем на ТЕСТ/DEV, прод не трогаем — деплой владельца)
- [ ] **P0 — доказать на TEST, что критический тик реально бежит** и доходит по всем разрешённым TEST-каналам.
      (В логах webapp/scheduler за 24ч тик не виден; дайджест идёт — значит расписание есть, но критический
      путь надо подтвердить живым прогоном на тесте: сигнал→рассыл во все каналы.) Проверка/активация на PROD —
      отдельный будущий owner gate, не часть repository/TEST-этапа.
- [x] **P1 — сигнал «отказ исходящей доставки» (корень).** Интегрирован `b64692aeb`, independent audit
      `0/0/0`: считать провал отправки как critical:
      (а) синхронный `send-email`/`send-sms` 5xx/EAUTH за окно (порог N за M мин) → critical;
      (б) убедиться, что relay-outbound помечает dead и это уже поднимает сигнал; свести оба в один топик
      `outbound_delivery_provider`. Класс тяжести = «стоп/красный».
- [x] **P2 — SMS-канал в `dispatchOperatorAlert`** (best-effort, skip если провайдер не подключён; ирония:
      если упал сам SMS-провайдер — этот канал молчит, остальные орут).
- [x] **P3 — эскалация (каденция владельца).** Заменить плоский 24ч-дедуп на состояние инцидента:
      T0 сразу → T+1h повтор → затем ежедневный утренний отчёт держит КРАСНЫМ до `resolved`. Ack/resolved
      снимает повтор. Хранить состояние (open/last_alerted/resolved) в operator-incident.
- [x] **P4 — тяжесть в UI/пуше.** Красный «!»/«стоп» для delivery-provider в push-заголовке, в баннере
      System Health и в утреннем дайджесте; дайджест перестаёт быть ложно-зелёным при открытом инциденте.
- [ ] **P-guard — приёмочные тесты:** отдельно разрешённый живой прогон на TEST (подсунуть битый SMTP-логин → убедиться, что
      прилетело в web_push+TG+MAX(+SMS), с красным «стоп»; через 1ч — повтор; утром — красный отчёт).
      Только заранее разрешённые TEST-получатели; DEV реальные отправки запрещены.

## Риски / принципы
- Канал алерта не должен зависеть от сломанного: веер по всем, каждый независим (telegram/max/web_push уже так; SMS добавить так же).
- Не спамить: дедуп остаётся, но заменяется на эскалацию по состоянию инцидента, а не «тишина 24ч».
- Аудит по риску: это observability-механика (не деньги/не изоляция) → worker + ОДИН независимый аудит на слайс, без серийных correction-раундов.
- «Готово» = зелёный full CI + живой прогон на тесте (битый провайдер → громкий алерт по всем каналам) + приёмка владельца. «audit PASS» сам по себе ≠ готово.

## Открытых развилок нет — старт с P1 (корень) + P0-проверка параллельно.

## Repository status 2026-07-22

P2–P4 интегрированы в `feat/doctor-ui-rebuild` through `1fd6bf66e`. SMS readiness и фактический SMSC client читают
одни canonical `public.system_settings` (`smsc_enabled` + restricted/redacted `smsc_api_key`); все четыре канала
стартуют независимо и relay имеет bounded timeout. Incident phases имеют durable claim/CAS, отдельные stable IDs,
ack/resolved lifecycle и красное представление до resolution. Focused integration verification: webapp `31/31`,
integrator `27/27`, journal sync и diff-check PASS; worker evidence дополнительно включает оба typecheck/build и
scoped lint. Попытка Vitest global setup применить `0229` рабочей app-role корректно получила `42501`; это не
заменяет canonical privileged migration, которая выполняется отдельно через недеструктивный DEV/TEST deploy path.
Accumulated full CI закрыт на descendant HEAD `63de21030` после интеграции `1fd6bf66e`. P0/P-guard и owner
acceptance остаются открыты, поэтому весь план ещё не `DONE`; CI PASS не подменяет разрешённый TEST fault injection.
