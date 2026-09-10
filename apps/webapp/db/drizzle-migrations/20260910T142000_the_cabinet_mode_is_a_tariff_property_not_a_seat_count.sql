-- BCB-MIGRATION-BACKFILL
--
-- Решение владельца 10.09.2026, дословно: «Число мест - не показатель, админ клиники может начинать
-- с одного себя и приглашать других - у соло механика приглашений отключена в принципе и в
-- интерфейсе этого нет и кол-во доступных специалистов даже не должно показываться в кабинете» и
-- «значит надо сделать и само свойство и переключатель в настройках тарифа - и режим кабинета
-- (соло или клиника) строить на основе этого свойства».
--
-- То есть режим кабинета — СОБСТВЕННОЕ свойство тарифа («Режим кабинета» в конструкторе тарифов,
-- ключ `clinic_team` в `saas_tariffs.mechanics`), а не вывод из числа мест. Клиника с одним местом
-- остаётся клиникой; соло-тариф с одним местом не получает ни приглашений, ни управления командой.
--
-- ШАГ 1 — данные. До этой миграции флага в `mechanics` у части тарифов просто нет: включённость
-- выводилась из `included_seats`, и конструктор ключ не писал. Тариф, который ПРОДАЁТ больше одного
-- места, заведомо был клиникой — иначе места некому продавать; ему флаг проставляется, чтобы живые
-- клиники не потеряли приглашения в момент выката. Тариф с одним местом НЕ трогаем: именно он и
-- есть соло, и именно его владелец переключает вручную, если решит продавать команду.

UPDATE public.saas_tariffs
SET mechanics = mechanics || '{"clinic_team": true}'::jsonb,
    updated_at = now()
WHERE NOT (mechanics ? 'clinic_team')
  AND included_seats IS NOT NULL
  AND included_seats > 1;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.resolve_organization_mechanic_access(uuid,text)')) LIKE '%WHEN p_mechanic = ''clinic_team'' THEN COALESCE((mechanics ->> ''clinic_team'')::boolean, false)%'
--
-- ШАГ 2 — живая дверь прав. Это та самая функция, через которую проходит КАЖДЫЙ
-- `requireEntitlement*` (`pgOrgEntitlements.resolveMechanicAccess`), поэтому правило TypeScript
-- (`isMechanicIncludedFromSnapshot`) без неё ничего не решает: до 10.09 здесь стояло
-- `included_seats IS NOT NULL`, и база выдавала `clinic_team` каждому тарифу, у которого просто
-- названо число мест.
--
-- Тело переписывается по якорю из ЖИВОГО определения (`pg_get_functiondef`) — тем же приёмом, что
-- `20260820T175432`, `20260823T030000` и `20260901T231600`: с 19.08 эту функцию переписали три
-- миграции, и `CREATE OR REPLACE` с фиксированным телом молча откатил бы их. Якорь ровно один,
-- иначе миграция падает громко.

DO $migration$
DECLARE
  v_identity regprocedure := 'app.resolve_organization_mechanic_access(uuid,text)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_anchor text := E'        WHEN p_mechanic = ''clinic_team'' THEN included_seats IS NOT NULL\n';
  v_replacement text := E'        -- Owner ruling 2026-09-10: the cabinet mode is an explicit tariff property, never a\n'
    || E'        -- headcount. «Число мест - не показатель, админ клиники может начинать с одного\n'
    || E'        -- себя и приглашать других - у соло механика приглашений отключена в принципе».\n'
    || E'        -- A tariff that did not switch «Режим кабинета» on has no clinic team at all, and\n'
    || E'        -- its `included_seats` says only how many seats the clinic mode would sell.\n'
    || E'        WHEN p_mechanic = ''clinic_team'' THEN COALESCE((mechanics ->> ''clinic_team'')::boolean, false)\n';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;

  IF v_definition IS NULL
    OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
  THEN
    RAISE EXCEPTION 'clinic_team seat anchor not found or ambiguous for %', v_identity;
  END IF;

  v_rewritten := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_rewritten;
END
$migration$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_invite_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.accept_org_invite(text,uuid,text)')) LIKE '%COALESCE((t.mechanics ->> ''clinic_team'')::boolean, false)%'
--
-- ШАГ 3 — вторая дверь с тем же правилом. `app.accept_org_invite` не зовёт общий резолвер: проверку
-- прав он обязан делать ВНУТРИ своей же транзакции под `FOR UPDATE`, поэтому правило продублировано
-- в теле (комментарий C4A там об этом и говорит). Дубль правила означает и дубль правки: без неё
-- соло-организация продолжила бы принимать приглашения, которых в её интерфейсе уже нет, — ровно то,
-- что владелец 10.09 запретил («у соло механика приглашений отключена в принципе»).
--
-- Порядок предпочтений не меняется: персональный override организации по-прежнему сильнее тарифа,
-- и отсутствие обоих по-прежнему закрывает дверь.

DO $migration$
DECLARE
  v_identity regprocedure := 'app.accept_org_invite(text,uuid,text)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_anchor text := E'    (SELECT t.included_seats IS NOT NULL\n'
    || E'     FROM public.be_organizations AS o\n'
    || E'     JOIN public.saas_tariffs AS t ON t.id = o.tariff_id\n';
  v_replacement text := E'    (SELECT COALESCE((t.mechanics ->> ''clinic_team'')::boolean, false)\n'
    || E'     FROM public.be_organizations AS o\n'
    || E'     JOIN public.saas_tariffs AS t ON t.id = o.tariff_id\n';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_identity) INTO v_definition;

  IF v_definition IS NULL
    OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1
  THEN
    RAISE EXCEPTION 'clinic_team seat anchor not found or ambiguous for %', v_identity;
  END IF;

  v_rewritten := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_rewritten;
END
$migration$;
