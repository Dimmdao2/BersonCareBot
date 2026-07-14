/**
 * Retired admin Rubitime M2M API facade.
 * The server-side admin routes still import this module during the cleanup window, but no function here
 * calls the integrator or the old provider-specific admin surface.
 */
export type RubitimeBranch = {
  id: number;
  rubitimeBranchId: number;
  cityCode: string;
  title: string;
  address: string;
  isActive: boolean;
};

export type RubitimeService = {
  id: number;
  rubitimeServiceId: number;
  title: string;
  categoryCode: string;
  durationMinutes: number;
  isActive: boolean;
};

export type RubitimeCooperator = {
  id: number;
  rubitimeCooperatorId: number;
  title: string;
  isActive: boolean;
};

export type RubitimeBookingProfile = {
  id: number;
  bookingType: "online" | "in_person";
  categoryCode: string;
  cityCode: string | null;
  branchId: number;
  serviceId: number;
  cooperatorId: number;
  isActive: boolean;
  rubitimeBranchId: number;
  rubitimeServiceId: number;
  rubitimeCooperatorId: number;
  durationMinutes: number;
  branchTitle: string;
  serviceTitle: string;
  cooperatorTitle: string;
};

function adminRetiredError(): Error {
  return new Error("rubitime_admin_retired");
}

// ---- Branches ----

export async function adminListBranches(): Promise<RubitimeBranch[]> {
  throw adminRetiredError();
}

export async function adminUpsertBranch(input: {
  rubitimeBranchId: number;
  cityCode: string;
  title: string;
  address?: string;
}): Promise<RubitimeBranch> {
  void input;
  throw adminRetiredError();
}

export async function adminDeactivateBranch(id: number): Promise<void> {
  void id;
  throw adminRetiredError();
}

// ---- Services ----

export async function adminListServices(): Promise<RubitimeService[]> {
  throw adminRetiredError();
}

export async function adminUpsertService(input: {
  rubitimeServiceId: number;
  title: string;
  categoryCode: string;
  durationMinutes: number;
}): Promise<RubitimeService> {
  void input;
  throw adminRetiredError();
}

export async function adminDeactivateService(id: number): Promise<void> {
  void id;
  throw adminRetiredError();
}

// ---- Cooperators ----

export async function adminListCooperators(): Promise<RubitimeCooperator[]> {
  throw adminRetiredError();
}

export async function adminUpsertCooperator(input: {
  rubitimeCooperatorId: number;
  title: string;
}): Promise<RubitimeCooperator> {
  void input;
  throw adminRetiredError();
}

export async function adminDeactivateCooperator(id: number): Promise<void> {
  void id;
  throw adminRetiredError();
}

// ---- Booking Profiles ----

export async function adminListBookingProfiles(): Promise<RubitimeBookingProfile[]> {
  throw adminRetiredError();
}

export async function adminUpsertBookingProfile(input: {
  bookingType: "online" | "in_person";
  categoryCode: string;
  cityCode?: string | null;
  branchId: number;
  serviceId: number;
  cooperatorId: number;
}): Promise<{ id: number }> {
  void input;
  throw adminRetiredError();
}

export async function adminDeactivateBookingProfile(id: number): Promise<void> {
  void id;
  throw adminRetiredError();
}
