export { normalizeRuPhoneE164 } from './phone.js';

export {
  mediaRootFromSourceS3Key,
  hlsTreePrefixFromMediaRoot,
  posterObjectKeyFromMediaRoot,
  masterPlaylistKeyFromMediaRoot,
  isCanonicalMediaRootForId,
  resolveHlsPurgeListPrefix,
  resolvePosterPurgeListPrefix,
  normalizeMediaS3Key,
  isTrustedHlsArtifactS3Key,
  isTrustedPosterS3Key,
} from './hlsStorageLayout.js';

export {
  buildVodMasterPlaylistBody,
  parseMasterPlaylistVariantRelativeUris,
  type MasterVariantEntry,
} from './hlsMasterPlaylist.js';

export {
  PLATFORM_INTEGRATION_IDS,
  normalizePlatformIntegrationAvailability,
  isPlatformIntegrationAvailable,
  hasPlatformIntegrationAvailabilityValue,
  type PlatformIntegrationAvailability,
  type PlatformIntegrationId,
} from './platformIntegrationAvailability.js';
