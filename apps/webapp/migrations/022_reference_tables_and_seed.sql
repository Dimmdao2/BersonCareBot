-- Stage 6: universal reference tables + seed (symptom_type, body_region, diagnosis, disease_stage, load_type).

CREATE TABLE IF NOT EXISTS reference_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_user_extensible BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES reference_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ref_items_category ON reference_items(category_id, sort_order);

-- Categories
INSERT INTO reference_categories (code, title, is_user_extensible, tenant_id) VALUES
  ('symptom_type', 'Тип симптома', true, NULL),
  ('body_region', 'Область тела', false, NULL),
  ('diagnosis', 'Диагноз', true, NULL),
  ('disease_stage', 'Стадия', false, NULL),
  ('load_type', 'Тип нагрузки', false, NULL)
ON CONFLICT (code) DO NOTHING;

-- symptom_type items
INSERT INTO reference_items (category_id, code, title, sort_order)
SELECT c.id, v.code, v.title, v.sort_order
FROM reference_categories c
CROSS JOIN (VALUES
  ('pain', 'Боль', 1),
  ('burning', 'Жжение', 2),
  ('numbness', 'Онемение', 3),
  ('weakness', 'Слабость', 4),
  ('tension', 'Напряжение', 5),
  ('edema', 'Отёк', 6),
  ('mobility_limit', 'Ограничение подвижности', 7),
  ('kinesiophobia', 'Кинезиофобия', 8),
  ('anxiety', 'Тревожность', 9),
  ('panic', 'Паническая атака', 10)
) AS v(code, title, sort_order)
WHERE c.code = 'symptom_type'
ON CONFLICT (category_id, code) DO NOTHING;

-- body_region
INSERT INTO reference_items (category_id, code, title, sort_order)
SELECT c.id, v.code, v.title, v.sort_order
FROM reference_categories c
CROSS JOIN (VALUES
  ('neck', 'Шея', 1),
  ('thoracic', 'Грудной отдел', 2),
  ('lumbar', 'Поясница', 3),
  ('shoulder', 'Плечо', 4),
  ('elbow', 'Локоть', 5),
  ('wrist', 'Кисть', 6),
  ('hip', 'Тазобедренный сустав', 7),
  ('knee', 'Колено', 8),
  ('ankle', 'Голеностоп', 9),
  ('foot', 'Стопа', 10)
) AS v(code, title, sort_order)
WHERE c.code = 'body_region'
ON CONFLICT (category_id, code) DO NOTHING;

-- diagnosis
INSERT INTO reference_items (category_id, code, title, sort_order)
SELECT c.id, v.code, v.title, v.sort_order
FROM reference_categories c
CROSS JOIN (VALUES
  ('osteochondrosis', 'Остеохондроз', 1),
  ('herniated_disc', 'Грыжа диска', 2),
  ('protrusion', 'Протрузия', 3),
  ('osteoarthritis', 'Артроз', 4),
  ('tendinitis', 'Тендинит', 5),
  ('bursitis', 'Бурсит', 6),
  ('carpal_tunnel', 'Туннельный синдром (кисть)', 7),
  ('cubital_tunnel', 'Туннельный синдром (локоть)', 8),
  ('radiculopathy', 'Радикулопатия', 9),
  ('peripheral_neuropathy', 'Периферическая нейропатия', 10)
) AS v(code, title, sort_order)
WHERE c.code = 'diagnosis'
ON CONFLICT (category_id, code) DO NOTHING;

-- disease_stage
INSERT INTO reference_items (category_id, code, title, sort_order)
SELECT c.id, v.code, v.title, v.sort_order
FROM reference_categories c
CROSS JOIN (VALUES
  ('acute', 'Острый период', 1),
  ('healing', 'Заживление', 2),
  ('remodeling', 'Ремоделирование тканей', 3),
  ('adaptation', 'Адаптация', 4),
  ('chronic', 'Хроническое течение', 5),
  ('recovery', 'Восстановление функций', 6),
  ('flare_prevention', 'Профилактика обострений', 7),
  ('return_to_sport', 'Возврат в спорт', 8),
  ('performance', 'Улучшение спорт результатов', 9)
) AS v(code, title, sort_order)
WHERE c.code = 'disease_stage'
ON CONFLICT (category_id, code) DO NOTHING;

-- load_type
INSERT INTO reference_items (category_id, code, title, sort_order)
SELECT c.id, v.code, v.title, v.sort_order
FROM reference_categories c
CROSS JOIN (VALUES
  ('high_rep', 'Многоповторное', 1),
  ('static_hold', 'Статика', 2),
  ('statodynamic', 'Статодинамика', 3),
  ('eccentric', 'Эксцентрика', 4),
  ('concentric', 'Концентрика', 5),
  ('plyometric', 'Плиометрика', 6),
  ('ballistic', 'Баллистика', 7),
  ('balance', 'Баланс', 8),
  ('stretch', 'Растяжка', 9),
  ('mobilization', 'Мобилизация', 10)
) AS v(code, title, sort_order)
WHERE c.code = 'load_type'
ON CONFLICT (category_id, code) DO NOTHING;
