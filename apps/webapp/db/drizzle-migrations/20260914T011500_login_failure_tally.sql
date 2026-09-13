-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.login_failure_tally') IS NOT NULL
-- #1112, Л-8. Где копится «сколько раз не подошло до входа».
--
-- Замысел владельца 14.09, дословно: «мы ПИШЕМ кол-во неверных попыток. до входа и привязываем к
-- сессии (известному устройству)» и «копить не счетчик для блокировки а сумму попыток для
-- устройства». То есть строки на каждую неудачную попытку НЕ появляется: между входами копится
-- маленький итог, при успешном входе он замораживается в строку журнала входов и обнуляется.
--
-- Почему отдельная таблица, а не колонки в `password_login_identifier_protection`:
-- 1. Тот счётчик управляет ЗАДЕРЖКОЙ И БЛОКИРОВКОЙ, и его обнуляют по своим правилам — при успехе и
--    при истечении 15-минутной блокировки. Терпеливый подбор (десять попыток, четверть часа, ещё
--    десять) заморозился бы в журнал как «девять» и остался бы там навсегда как неправда.
-- 2. Он же насыщается на десяти (`least(v_attempts, 10)`), то есть «3412 попыток за год» им не
--    выражается в принципе.
-- 3. Разделение важно и в обратную сторону: правя механику блокировки, нельзя случайно испортить
--    число, которое видит человек, и наоборот.
--
-- Почему ключ — пара «человек + устройство», а не один человек: владельцу нужно различать «четырнадцать
-- неверных паролей на вашем же ноутбуке» (кто-то за вашим столом) и «три тысячи с неизвестных машин»
-- (долбят извне). Это два разных происшествия, и лечатся они по-разному.
CREATE TABLE public.login_failure_tally (
  user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  -- Пустая строка — общий мешок «с неизвестного устройства»: метку устройства мы выдаём только после
  -- УСПЕШНОГО входа, поэтому у того, кто ни разу не вошёл, её и нет. Отдельным NULL это быть не может:
  -- колонка входит в первичный ключ.
  device_key text NOT NULL,
  failed_passwords integer NOT NULL DEFAULT 0,
  failed_second_factor integer NOT NULL DEFAULT 0,
  -- Разные адреса, с которых шли отказы: отличают одного упорного от полусотни машин.
  -- ⛔ Список ОГРАНИЧЕН тридцатью двумя: подбирающий не должен уметь раздувать нашу запись, сколько бы
  -- ни стучался. На потолке экран говорит «32 и более» — это правда и без отдельного флага.
  source_addresses inet[] NOT NULL DEFAULT '{}',
  first_failure_at timestamptz,
  last_failure_at timestamptz,
  PRIMARY KEY (user_id, device_key),
  CONSTRAINT login_failure_tally_counts_nonnegative
    CHECK (failed_passwords >= 0 AND failed_second_factor >= 0),
  CONSTRAINT login_failure_tally_sources_bounded
    CHECK (cardinality(source_addresses) <= 32)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 5 FROM pg_attribute WHERE attrelid = 'public.user_login_events'::regclass AND attname IN ('failed_passwords_before', 'failed_passwords_before_unknown', 'unknown_sources_before', 'failed_second_factor_before', 'failures_since') AND NOT attisdropped
-- Замороженный итог. Живёт на строке входа, потому что строка входа уже есть, уже несёт время,
-- устройство, адрес, браузер и страну, и уже никогда не меняется. Отдельного хранилища не нужно —
-- владелец: «у нас же есть эта история».
--
-- NULL здесь ЗНАЧИМ и не равен нулю: NULL — «тогда не считали» (входы до этой работы), 0 — «считали,
-- не было ни одной неудачной попытки». Смешать их значило бы показать человеку спокойный ноль там,
-- где мы просто не смотрели.
--
-- Почему два числа по паролю, а не одно: «четырнадцать раз не подошёл пароль на ЭТОМ ноутбуке» и
-- «четырнадцать раз с машин, которые у нас входа не проходили» — разные происшествия. Сложить их в
-- одно число значило бы стереть именно ту разницу, ради которой считаем.
--
-- `failures_since` — начало периода, за который набрано число. Без него «3412 попыток» повисает без
-- срока: для своего устройства границей служит предыдущий вход, а мешок неизвестных сливается в
-- ЛЮБОЙ ближайший успешный вход, и его период предыдущей строкой журнала не читается.
ALTER TABLE public.user_login_events
  ADD COLUMN failed_passwords_before integer,
  ADD COLUMN failed_passwords_before_unknown integer,
  ADD COLUMN unknown_sources_before integer,
  ADD COLUMN failed_second_factor_before integer,
  ADD COLUMN failures_since timestamptz;
