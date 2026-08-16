-- BCB-MIGRATION-OWNER: app_object_owner
-- Media folders are tenant-local. Preserve one legacy NULL-organization namespace while allowing
-- every organization (and the same patient in several organizations) its own upload tree.

DROP INDEX IF EXISTS public.uq_media_folders_root_name;
DROP INDEX IF EXISTS public.uq_media_folders_client_patient_user;
DROP INDEX IF EXISTS public.uq_media_folders_client_files_root;

CREATE UNIQUE INDEX uq_media_folders_root_name
  ON public.media_folders (organization_id, name_normalized)
  WHERE parent_id IS NULL AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX uq_media_folders_root_name_legacy
  ON public.media_folders (name_normalized)
  WHERE parent_id IS NULL AND organization_id IS NULL;

CREATE UNIQUE INDEX uq_media_folders_client_patient_user
  ON public.media_folders (organization_id, patient_user_id)
  WHERE kind = 'client_patient' AND patient_user_id IS NOT NULL AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX uq_media_folders_client_patient_user_legacy
  ON public.media_folders (patient_user_id)
  WHERE kind = 'client_patient' AND patient_user_id IS NOT NULL AND organization_id IS NULL;

CREATE UNIQUE INDEX uq_media_folders_client_files_root
  ON public.media_folders (organization_id)
  WHERE kind = 'client_files_root' AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX uq_media_folders_client_files_root_legacy
  ON public.media_folders ((1))
  WHERE kind = 'client_files_root' AND organization_id IS NULL;
