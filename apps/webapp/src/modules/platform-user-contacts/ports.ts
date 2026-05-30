import type { PlatformUserContactSource, PlatformUserContactType } from "./types";

export type PlatformUserContactRecord = {
  id: string;
  platformUserId: string;
  contactType: PlatformUserContactType;
  value: string;
  valueNormalized: string;
  source: PlatformUserContactSource;
  createdAt: string;
  updatedAt: string;
};

export type PlatformUserContactsPort = {
  listByPlatformUserId(platformUserId: string): Promise<PlatformUserContactRecord[]>;
  upsertContact(input: {
    platformUserId: string;
    contactType: PlatformUserContactType;
    value: string;
    valueNormalized: string;
    source: PlatformUserContactSource;
  }): Promise<PlatformUserContactRecord>;
  deleteById(input: { id: string; platformUserId: string }): Promise<boolean>;
};
