-- Per-organization reference catalogs. Baseline v1 is copied once when an organization is
-- provisioned; later baseline versions never mutate already provisioned organizations.

-- Serialize the initial cutover against live organization INSERTs. Later migrations add the
-- permanent receipt and canonical INSERT hook.
LOCK TABLE public.be_organizations IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM reference_categories WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'reference_categories.organization_id must be populated before tenant cutover';
  END IF;
  IF EXISTS (SELECT 1 FROM reference_items WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'reference_items.organization_id must be populated before tenant cutover';
  END IF;
  IF EXISTS (
    SELECT 1 FROM reference_items i
    JOIN reference_categories c ON c.id = i.category_id
    WHERE i.organization_id <> c.organization_id
  ) THEN
    RAISE EXCEPTION 'reference item/category organization mismatch';
  END IF;
END $$;

ALTER TABLE reference_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE reference_items ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE reference_categories DROP CONSTRAINT IF EXISTS reference_categories_code_key;
ALTER TABLE reference_categories
  ADD CONSTRAINT reference_categories_organization_id_code_key UNIQUE (organization_id, code);
ALTER TABLE reference_categories
  ADD CONSTRAINT reference_categories_id_organization_id_key UNIQUE (id, organization_id);
ALTER TABLE reference_items
  ADD CONSTRAINT reference_items_category_organization_fkey
  FOREIGN KEY (category_id, organization_id)
  REFERENCES reference_categories(id, organization_id)
  ON DELETE CASCADE;

CREATE TABLE reference_catalog_baselines (
  version integer PRIMARY KEY,
  definition_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_catalog_baselines_definition_object_check
    CHECK (jsonb_typeof(definition_json) = 'object')
);

COMMENT ON TABLE reference_catalog_baselines IS
  'Versioned global templates copied once into a new organization. Existing organization catalogs are never synchronized from this table.';

INSERT INTO reference_catalog_baselines (version, definition_json)
VALUES (1, $baseline$
{
  "categories": [
    {"code":"body_region","title":"Область тела","isUserExtensible":false,"items":[["head","Голова",1],["tmj","ВНЧС",2],["neck","Шея",3],["spatula","Лопатка",4],["thoracic","Грудной отдел",5],["shoulder","Плечо",6],["elbow","Локоть",7],["forearm","Предплечье",8],["wrist","Кисть",9],["toes","Пальцы рук",10],["lumbar","Поясница",11],["core","Кор",12],["pelvis","Таз",13],["hip","Тазобедренный сустав",14],["femur","Бедро",15],["knee","Колено",16],["ankle","Голеностоп",17],["foot","Стопа",18],["fingers","Пальцы ног",19],["leg","Голень",20]]},
    {"code":"clinical_assessment_kind","title":"Виды оценки (клинические тесты)","isUserExtensible":false,"items":[["mobility","Подвижность",1],["pain","Болезненность",2],["sensitivity","Чувствительность",3],["strength","Сила",4],["neurodynamics","Нейродинамика",5],["proprioception","Проприоцепция",6],["balance","Равновесие",7],["endurance","Выносливость",8]]},
    {"code":"diagnosis","title":"Диагноз","isUserExtensible":true,"items":[["osteochondrosis","Остеохондроз",1],["herniated_disc","Грыжа диска",2],["protrusion","Протрузия",3],["osteoarthritis","Артроз",4],["tendinitis","Тендинит",5],["bursitis","Бурсит",6],["carpal_tunnel","Туннельный синдром (кисть)",7],["cubital_tunnel","Туннельный синдром (локоть)",8],["radiculopathy","Радикулопатия",9],["peripheral_neuropathy","Периферическая нейропатия",10]]},
    {"code":"disease_stage","title":"Стадия","isUserExtensible":false,"items":[["chronic","Хроническое течение",1],["acute","Острый период",2],["healing","Заживление",3],["remodeling","Ремоделирование тканей",4],["adaptation","Функциональная адаптация",5],["recovery","Восстановление бытовой активности",6],["flare_prevention","Профилактика обострений",7],["return_to_sport","Возврат в спорт",8],["performance","Улучшение спорт результатов",9]]},
    {"code":"load_type","title":"Тип нагрузки","isUserExtensible":false,"items":[["neurodinamica","Нейродинамика",1],["mobilization","Мобилизация",2],["stretch","Растяжка",3],["high_rep","Многоповторное",4],["static_hold","Статика",5],["statodynamic","Статодинамика",6],["eccentric","Эксцентрика",7],["strength","Силовая",8],["balance","Баланс",9],["plyometric","Плиометрика",10],["ballistic","Баллистика",11],["aerobic","Аэробное",12],["cardio","Кардио",13]]},
    {"code":"recommendation_type","title":"Типы рекомендаций","isUserExtensible":false,"items":[["exercise_technique","Техника упражнений",1],["regimen","Режим / график",2],["nutrition","Питание",3],["device","Устройство / аппарат",4],["self_procedure","Самостоятельная процедура",5],["external_therapy","Внешняя терапия",6],["lifestyle","Образ жизни",7],["daily_activity","Бытовая активность",8],["physiotherapy","Физиотерапия",9],["motivation","Мотивация",10],["safety","Техника безопасности",11]]},
    {"code":"symptom_type","title":"Тип симптома","isUserExtensible":false,"items":[["general_wellbeing","Общее самочувствие",0,{"system":true}],["warmup_feeling","Самочувствие после разминки",0,{"system":true}],["pain","Боль",1],["burning","Жжение",2],["numbness","Онемение",3],["weakness","Слабость",4],["tension","Напряжение",5],["edema","Отёк",6],["mobility_limit","Ограничение подвижности",7],["uncontrollability","Дефицит двигательного контроля",8],["kinesiophobia","Кинезиофобия",9],["anxiety","Тревожность",10],["panic","Паническая атака",11],["fatigue","Утомляемость",12],["stress","Стресс",13],["tingling","Покалывания",14],["tinnitus","Тиннитус (шум в ушах)",15],["dizziness","Головокружение",16]]},
    {"code":"visit_manipulation","title":"Манипуляции визита","isUserExtensible":true,"items":[]}
  ]
}
$baseline$::jsonb)
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION app.seed_reference_catalog_snapshot(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_version integer;
  v_definition jsonb;
  v_category jsonb;
  v_item jsonb;
  v_category_id uuid;
BEGIN
  SELECT version, definition_json INTO STRICT v_version, v_definition
  FROM public.reference_catalog_baselines
  ORDER BY version DESC
  LIMIT 1;

  FOR v_category IN SELECT value FROM jsonb_array_elements(v_definition->'categories') LOOP
    INSERT INTO public.reference_categories (organization_id, code, title, is_user_extensible)
    VALUES (
      p_organization_id,
      v_category->>'code',
      v_category->>'title',
      (v_category->>'isUserExtensible')::boolean
    )
    ON CONFLICT (organization_id, code) DO NOTHING;
    SELECT id INTO STRICT v_category_id
    FROM public.reference_categories
    WHERE organization_id = p_organization_id AND code = v_category->>'code';

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_category->'items') LOOP
      INSERT INTO public.reference_items (
        organization_id, category_id, code, title, sort_order, is_active, meta_json
      ) VALUES (
        p_organization_id,
        v_category_id,
        v_item->>0,
        v_item->>1,
        (v_item->>2)::integer,
        true,
        COALESCE(v_item->3, '{}'::jsonb)
      )
      ON CONFLICT (category_id, code) DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN v_version;
END
$$;

REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;

-- FORCE RLS applies to table/function owners. This policy exists only inside the migration
-- transaction and only for the SECURITY DEFINER helper owner while the organization lock is held.
DO $$
DECLARE
  v_helper_owner text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT v_helper_owner
  FROM pg_proc
  WHERE oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure;
  EXECUTE format(
    'CREATE POLICY reference_catalog_migration_seed ON public.reference_categories FOR ALL TO %I USING (current_user = %L) WITH CHECK (current_user = %L)',
    v_helper_owner, v_helper_owner, v_helper_owner
  );
  EXECUTE format(
    'CREATE POLICY reference_catalog_migration_seed ON public.reference_items FOR ALL TO %I USING (current_user = %L) WITH CHECK (current_user = %L)',
    v_helper_owner, v_helper_owner, v_helper_owner
  );
END
$$;

-- Initial tenant cutover: preserve every existing UUID/value and only fill missing baseline rows.
DO $$
DECLARE v_org record;
BEGIN
  FOR v_org IN SELECT id FROM be_organizations LOOP
    PERFORM app.seed_reference_catalog_snapshot(v_org.id);
  END LOOP;
END $$;

DROP POLICY reference_catalog_migration_seed ON public.reference_categories;
DROP POLICY reference_catalog_migration_seed ON public.reference_items;
