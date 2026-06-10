export {
  isSystemManagedMediaFolder,
  pgEnsureClientFilesRootFolder,
  pgEnsureClientPatientFolder,
  pgValidateManualFolderParent,
  pgValidateUserAssignableMediaFolder,
} from "@/infra/repos/pgClientMediaFolders";

export type { MediaFolderAssignmentError } from "@/infra/repos/pgClientMediaFolders";
