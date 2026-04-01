/**
 * Webapp-клиент для admin Rubitime M2M API.
 *
 * Эти функции вызываются только в server-side webapp API routes (Next.js Route Handlers).
 * Подписывают запросы тем же HMAC, что booking M2M.
 */
import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";

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

async function adminRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const base = ((await getIntegratorApiUrl()) ?? "").trim().replace(/\/$/, "");
  const secret = ((await getIntegratorWebhookSecret()) ?? "").trim();
  if (!base || !secret) throw new Error("integrator_not_configured");

  const rawBody = body !== undefined ? JSON.stringify(body) : "{}";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Bersoncare-Timestamp": timestamp,
      "X-Bersoncare-Signature": signature,
    },
    body: rawBody,
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

// ---- Branches ----

export async function adminListBranches(): Promise<RubitimeBranch[]> {
  const { status, json } = await adminRequest("GET", "/api/bersoncare/rubitime/admin/branches");
  if (status !== 200 || !Array.isArray(json.branches)) throw new Error("rubitime_admin_branches_failed");
  return json.branches as RubitimeBranch[];
}

export async function adminUpsertBranch(input: {
  rubitimeBranchId: number;
  cityCode: string;
  title: string;
  address?: string;
}): Promise<RubitimeBranch> {
  const { status, json } = await adminRequest("POST", "/api/bersoncare/rubitime/admin/branches", input);
  if (status !== 200 || !json.branch) throw new Error("rubitime_admin_upsert_branch_failed");
  return json.branch as RubitimeBranch;
}

export async function adminDeactivateBranch(id: number): Promise<void> {
  const { status } = await adminRequest("DELETE", `/api/bersoncare/rubitime/admin/branches/${id}`);
  if (status !== 200) throw new Error("rubitime_admin_deactivate_branch_failed");
}

// ---- Services ----

export async function adminListServices(): Promise<RubitimeService[]> {
  const { status, json } = await adminRequest("GET", "/api/bersoncare/rubitime/admin/services");
  if (status !== 200 || !Array.isArray(json.services)) throw new Error("rubitime_admin_services_failed");
  return json.services as RubitimeService[];
}

export async function adminUpsertService(input: {
  rubitimeServiceId: number;
  title: string;
  categoryCode: string;
  durationMinutes: number;
}): Promise<RubitimeService> {
  const { status, json } = await adminRequest("POST", "/api/bersoncare/rubitime/admin/services", input);
  if (status !== 200 || !json.service) throw new Error("rubitime_admin_upsert_service_failed");
  return json.service as RubitimeService;
}

export async function adminDeactivateService(id: number): Promise<void> {
  const { status } = await adminRequest("DELETE", `/api/bersoncare/rubitime/admin/services/${id}`);
  if (status !== 200) throw new Error("rubitime_admin_deactivate_service_failed");
}

// ---- Cooperators ----

export async function adminListCooperators(): Promise<RubitimeCooperator[]> {
  const { status, json } = await adminRequest("GET", "/api/bersoncare/rubitime/admin/cooperators");
  if (status !== 200 || !Array.isArray(json.cooperators)) throw new Error("rubitime_admin_cooperators_failed");
  return json.cooperators as RubitimeCooperator[];
}

export async function adminUpsertCooperator(input: {
  rubitimeCooperatorId: number;
  title: string;
}): Promise<RubitimeCooperator> {
  const { status, json } = await adminRequest("POST", "/api/bersoncare/rubitime/admin/cooperators", input);
  if (status !== 200 || !json.cooperator) throw new Error("rubitime_admin_upsert_cooperator_failed");
  return json.cooperator as RubitimeCooperator;
}

export async function adminDeactivateCooperator(id: number): Promise<void> {
  const { status } = await adminRequest("DELETE", `/api/bersoncare/rubitime/admin/cooperators/${id}`);
  if (status !== 200) throw new Error("rubitime_admin_deactivate_cooperator_failed");
}

// ---- Booking Profiles ----

export async function adminListBookingProfiles(): Promise<RubitimeBookingProfile[]> {
  const { status, json } = await adminRequest("GET", "/api/bersoncare/rubitime/admin/booking-profiles");
  if (status !== 200 || !Array.isArray(json.profiles)) throw new Error("rubitime_admin_profiles_failed");
  return json.profiles as RubitimeBookingProfile[];
}

export async function adminUpsertBookingProfile(input: {
  bookingType: "online" | "in_person";
  categoryCode: string;
  cityCode?: string | null;
  branchId: number;
  serviceId: number;
  cooperatorId: number;
}): Promise<{ id: number }> {
  const { status, json } = await adminRequest("POST", "/api/bersoncare/rubitime/admin/booking-profiles", {
    ...input,
    cityCode: input.cityCode ?? null,
  });
  if (status !== 200 || typeof json.id !== "number") throw new Error("rubitime_admin_upsert_profile_failed");
  return { id: json.id as number };
}

export async function adminDeactivateBookingProfile(id: number): Promise<void> {
  const { status } = await adminRequest("DELETE", `/api/bersoncare/rubitime/admin/booking-profiles/${id}`);
  if (status !== 200) throw new Error("rubitime_admin_deactivate_profile_failed");
}
