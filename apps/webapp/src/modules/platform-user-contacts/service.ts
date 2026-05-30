import { normalizeContactValue } from "./normalizeContactValue";
import type { PlatformUserContactsPort } from "./ports";
import {
  PLATFORM_USER_CONTACT_SOURCES,
  PLATFORM_USER_CONTACT_TYPES,
  PlatformUserContactValidationError,
  type PlatformUserContactSource,
  type PlatformUserContactType,
} from "./types";

function assertContactType(v: string): PlatformUserContactType {
  if ((PLATFORM_USER_CONTACT_TYPES as readonly string[]).includes(v)) {
    return v as PlatformUserContactType;
  }
  throw new PlatformUserContactValidationError("invalid_type");
}

function assertContactSource(v: string): PlatformUserContactSource {
  if ((PLATFORM_USER_CONTACT_SOURCES as readonly string[]).includes(v)) {
    return v as PlatformUserContactSource;
  }
  throw new PlatformUserContactValidationError("invalid_source");
}

export function createPlatformUserContactsService(port: PlatformUserContactsPort) {
  return {
    listForPlatformUser(platformUserId: string) {
      return port.listByPlatformUserId(platformUserId);
    },

    async upsert(input: {
      platformUserId: string;
      contactType: PlatformUserContactType | string;
      value: string;
      source: PlatformUserContactSource | string;
    }) {
      const contactType = assertContactType(input.contactType);
      const source = assertContactSource(input.source);
      const trimmed = input.value.trim();
      if (!trimmed) {
        throw new PlatformUserContactValidationError("empty_value");
      }
      const valueNormalized = normalizeContactValue(contactType, trimmed);
      if (!valueNormalized) {
        throw new PlatformUserContactValidationError("invalid_value");
      }
      return port.upsertContact({
        platformUserId: input.platformUserId,
        contactType,
        value: trimmed,
        valueNormalized,
        source,
      });
    },

    deleteContact(input: { id: string; platformUserId: string }) {
      return port.deleteById(input);
    },
  };
}

export type PlatformUserContactsService = ReturnType<typeof createPlatformUserContactsService>;
