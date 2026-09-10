-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.saas_storage_packages') IS NOT NULL AND to_regclass('public.saas_storage_package_period_prices') IS NOT NULL
--
-- Поручение владельца 10.09.2026: «Докупка места в настройках должна быть у всех. Пакеты с
-- количеством места должны настраиваться в кабинете администраторов… какие пакеты можно докупать?
-- Какой объём? Сколько стоит?». План — `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`.
--
-- Каталог платформенный, как тарифы: организация пакет не заводит, она выбирает его из этого
-- списка. Объём — в БАЙТАХ, той же мерой, что и счётчик занятого (`media_files.size_bytes`), чтобы
-- сложение «лимит тарифа + пакет» нигде не пересчитывало единицы.
--
-- Снятый с продажи пакет не удаляется (`is_active = false`): его уже могли купить, и строка нужна
-- и счёту, и экрану. Поэтому у цен `ON DELETE CASCADE` от пакета, а у периода — `RESTRICT`: снятый
-- период биллинга не должен молча унести с собой цену пакета.

CREATE TABLE saas_storage_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bytes bigint NOT NULL,
  currency text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_storage_packages_bytes_check CHECK (bytes > 0)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_saas_storage_packages_active_sort ON saas_storage_packages (is_active, sort_order);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
--
-- Цена за период — та же форма, что у `saas_tariff_period_prices` (#1069, сетка периодов 05.09):
-- одна строка на пару (пакет, период). Владелец 10.09 выбрал «цена за период тарифа, как у
-- дополнительного места», а периодов у платформы столько, сколько строк в `saas_billing_periods`,
-- поэтому одним числом эта цена не выражается: для месячного и годового тарифа она разная.
CREATE TABLE saas_storage_package_period_prices (
  package_id uuid NOT NULL REFERENCES saas_storage_packages(id) ON DELETE CASCADE,
  billing_period_code text NOT NULL REFERENCES saas_billing_periods(code) ON DELETE RESTRICT,
  price_minor integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, billing_period_code),
  CONSTRAINT saas_storage_package_period_prices_price_check CHECK (price_minor >= 0)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_saas_storage_package_period_prices_period
  ON saas_storage_package_period_prices (billing_period_code, package_id);
