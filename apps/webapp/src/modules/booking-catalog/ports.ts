import type {
  BookingCity,
  BookingBranch,
  BookingSpecialist,
  BookingService,
  BookingBranchService,
  ResolvedBranchService,
} from "./types";

/** Read port — used by patient flow and admin UI. */
export type BookingCatalogReadPort = {
  /** Active cities sorted by sort_order. */
  listCitiesForPatient(): Promise<BookingCity[]>;

  /**
   * Active branch-service links for the given city code.
   * Returns fully joined records (branch + service + specialist).
   */
  listServicesByCity(cityCode: string): Promise<BookingBranchService[]>;

  /**
   * Resolve a single branch-service record by id with full join.
   * Returns null if not found or inactive.
   */
  resolveBranchService(branchServiceId: string): Promise<ResolvedBranchService | null>;
};

/** Write port — used by seed script and admin CRUD (Stage 3). */
export type BookingCatalogWritePort = {
  upsertCity(input: {
    code: string;
    title: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BookingCity>;

  upsertBranch(input: {
    cityCode: string;
    title: string;
    address: string | null;
    rubitimeBranchId: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<{ id: string }>;

  upsertSpecialist(input: {
    rubitimeBranchId: string;
    fullName: string;
    description: string | null;
    rubitimeCooperatorId: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<{ id: string }>;

  upsertService(input: {
    title: string;
    description: string | null;
    durationMinutes: number;
    priceMinor: number;
    isActive: boolean;
    sortOrder: number;
  }): Promise<{ id: string }>;

  upsertBranchService(input: {
    rubitimeBranchId: string;
    serviceTitle: string;
    serviceDurationMinutes: number;
    rubitimeCooperatorId: string;
    rubitimeServiceId: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<{ id: string }>;
};

/** Admin CRUD (Stage 3): list/get/update/deactivate by id + branch-service upsert by FKs. */
export type BookingCatalogAdminPort = {
  listCitiesAdmin(): Promise<BookingCity[]>;
  getCityById(id: string): Promise<BookingCity | null>;
  updateCityById(
    id: string,
    patch: { title?: string; isActive?: boolean; sortOrder?: number },
  ): Promise<BookingCity | null>;
  deactivateCity(id: string): Promise<boolean>;

  listBranchesAdmin(): Promise<BookingBranch[]>;
  getBranchById(id: string): Promise<BookingBranch | null>;
  updateBranchById(
    id: string,
    patch: {
      cityId?: string;
      title?: string;
      address?: string | null;
      rubitimeBranchId?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ): Promise<BookingBranch | null>;
  deactivateBranch(id: string): Promise<boolean>;

  listServicesAdmin(): Promise<BookingService[]>;
  getServiceById(id: string): Promise<BookingService | null>;
  updateServiceById(
    id: string,
    patch: {
      title?: string;
      description?: string | null;
      durationMinutes?: number;
      priceMinor?: number;
      isActive?: boolean;
      sortOrder?: number;
    },
  ): Promise<BookingService | null>;
  deactivateService(id: string): Promise<boolean>;

  listSpecialistsAdmin(branchId?: string): Promise<BookingSpecialist[]>;
  getSpecialistById(id: string): Promise<BookingSpecialist | null>;
  updateSpecialistById(
    id: string,
    patch: {
      branchId?: string;
      fullName?: string;
      description?: string | null;
      rubitimeCooperatorId?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ): Promise<BookingSpecialist | null>;
  deactivateSpecialist(id: string): Promise<boolean>;

  listBranchServicesAdmin(branchId?: string): Promise<BookingBranchService[]>;
  getBranchServiceById(id: string): Promise<BookingBranchService | null>;
  upsertBranchServiceAdmin(input: {
    branchId: string;
    serviceId: string;
    specialistId: string;
    rubitimeServiceId: string;
    isActive: boolean;
    sortOrder: number;
  }): Promise<BookingBranchService>;
  deactivateBranchService(id: string): Promise<boolean>;
};

export type BookingCatalogPort = BookingCatalogReadPort &
  BookingCatalogWritePort &
  BookingCatalogAdminPort;
