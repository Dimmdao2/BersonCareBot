-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saas_billing_subscriptions' AND column_name IN ('paid_storage_package_id', 'pending_storage_package_id', 'storage_package_cancel_at_period_end')
--
-- Владелец 10.09.2026: «если надо увеличить место, приобретается пакет… предоставляется пакет
-- места [сразу], со следующего периода счёт выставляется» и «пока он места не освободит, этого не
-- может произойти — отказ на отключение доппакета». План — `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`.
--
-- Купленный объём живёт ТАМ ЖЕ, где купленные места (`paid_additional_seats`): на подписке
-- организации. Хранится ССЫЛКА на пакет каталога, а не скопированное число байт — иначе у одного
-- и того же пакета появилось бы два ответа на вопрос «сколько в нём места», и они разошлись бы при
-- первой же правке каталога.
--
-- Три колонки, потому что у докупки три различимых состояния, и молчаливого NULL для них не хватает:
--   * `paid_storage_package_id` — что действует СЕЙЧАС (объём даётся сразу при покупке);
--   * `pending_storage_package_id` — переход на пакет другого размера со следующего периода;
--   * `storage_package_cancel_at_period_end` — отказ, тоже с конца оплаченного периода. Отдельный
--     флаг, а не «pending = NULL»: NULL означает «перехода нет», и одним полем «нет перехода» и
--     «переход в ноль» неразличимы.
-- Переход и отказ взаимоисключающи, и оба бессмысленны без действующего пакета — это и проверяет
-- ограничение ниже, чтобы противоречивое состояние не появилось даже из чужого кода.
--
-- ON DELETE RESTRICT у обеих ссылок: снятый с продажи пакет из каталога не удаляется (`is_active =
-- false`), а если кто-то попробует удалить строку, за которую платит живая организация, база должна
-- отказать, а не молча обнулить её объём. Права на новые колонки выдаются НЕ здесь —
-- `deploy/postgres/privileges/declaration.ts` + reconcile (AGENTS.md §1).

ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN paid_storage_package_id uuid
    REFERENCES public.saas_storage_packages(id) ON DELETE RESTRICT,
  ADD COLUMN pending_storage_package_id uuid
    REFERENCES public.saas_storage_packages(id) ON DELETE RESTRICT,
  ADD COLUMN storage_package_cancel_at_period_end boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.saas_billing_subscriptions
  ADD CONSTRAINT saas_billing_subscriptions_storage_package_change_check
  CHECK (
    (pending_storage_package_id IS NULL OR NOT storage_package_cancel_at_period_end)
    AND (paid_storage_package_id IS NOT NULL
         OR (pending_storage_package_id IS NULL AND NOT storage_package_cancel_at_period_end))
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Обратный поиск «кто сейчас платит за этот пакет» — им отвечает и экран каталога, и проверка перед
-- снятием пакета с продажи.
CREATE INDEX idx_saas_billing_subscriptions_paid_storage_package
  ON public.saas_billing_subscriptions (paid_storage_package_id)
  WHERE paid_storage_package_id IS NOT NULL;
