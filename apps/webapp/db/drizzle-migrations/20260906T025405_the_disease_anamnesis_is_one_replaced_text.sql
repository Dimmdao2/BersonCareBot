-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.clinical_disease_anamnesis') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clinical_disease_anamnesis' AND column_name = 'text') AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'clinical_disease_anamnesis' AND indexname = 'uq_clinical_disease_anamnesis_patient_org')
--
-- DISEASE-ANAMNESIS-01 (owner acceptance 2026-09-04, П4.2): «Анамнез заболевания» — отдельный
-- белый блок после диагнозов, единый patient-scoped текст, который НЕ смешивается с
-- биографическими секциями «Анамнез жизни» (clinical_anamnesis_trauma/illness/lifestyle рядом:
-- append-log без удаления). Эта таблица — противоположность: правка ЗАМЕНЯЕТ текст целиком, одна
-- строка на пациента в рамках организации (уникальный индекс ниже), как и у остальных
-- clinical_*-таблиц organization_id несёт clinic+patient RLS-стену, а не второй источник правды.
CREATE TABLE public.clinical_disease_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  patient_user_id uuid NOT NULL,
  text text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clinical_disease_anamnesis_organization_id_fkey FOREIGN KEY (organization_id)
    REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT clinical_disease_anamnesis_patient_fkey FOREIGN KEY (patient_user_id)
    REFERENCES public.platform_users(id) ON DELETE CASCADE,
  CONSTRAINT clinical_disease_anamnesis_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.platform_users(id) ON DELETE RESTRICT
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Один текст на пациента в рамках организации: правка — upsert по (patient_user_id, organization_id),
-- не новая строка.
CREATE UNIQUE INDEX uq_clinical_disease_anamnesis_patient_org
  ON public.clinical_disease_anamnesis USING btree (patient_user_id, organization_id);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_clinical_disease_anamnesis_organization_id
  ON public.clinical_disease_anamnesis USING btree (organization_id);
