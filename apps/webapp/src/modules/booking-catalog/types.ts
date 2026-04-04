/** Domain types for the booking catalog (in-person v2). Online flow is not affected. */

export type BookingCity = {
  id: string;
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BookingBranch = {
  id: string;
  cityId: string;
  title: string;
  address: string | null;
  rubitimeBranchId: string;
  /** IANA timezone for this branch (wall time / Rubitime naive datetimes). */
  timezone: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BookingSpecialist = {
  id: string;
  branchId: string;
  fullName: string;
  description: string | null;
  rubitimeCooperatorId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BookingService = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BookingBranchService = {
  id: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  rubitimeServiceId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Joined from booking_branches */
  branch?: BookingBranch;
  /** Joined from booking_services */
  service?: BookingService;
  /** Joined from booking_specialists */
  specialist?: BookingSpecialist;
};

export type ResolvedBranchService = {
  branchService: BookingBranchService;
  branch: BookingBranch;
  service: BookingService;
  specialist: BookingSpecialist;
  city: BookingCity;
};
