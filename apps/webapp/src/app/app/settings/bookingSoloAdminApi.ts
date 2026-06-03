const BASE = "/api/admin/booking-engine";

export type SoloOverview = {
  organizationId: string;
  organization: { id: string; title: string } | null;
  branches: {
    id: string;
    title: string;
    cityCode: string;
    address: string | null;
    timezone: string;
    isActive: boolean;
    sortOrder: number;
  }[];
  specialists: { id: string; fullName: string; isActive: boolean }[];
  services: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    priceMinor: number;
    publicWidgetVisible: boolean;
    adminManualOnly: boolean;
    usableInPackages: boolean;
    prepaymentApplicable: boolean;
    onlinePaymentApplicable: boolean;
    isActive: boolean;
    sortOrder: number;
  }[];
  specialistAvailability: {
    id: string;
    specialistId: string;
    serviceId: string;
    branchId: string | null;
    isActive: boolean;
  }[];
  locationAvailability: { id: string; serviceId: string; branchId: string; isActive: boolean }[];
};

export async function apiJson<T extends { ok?: boolean; error?: string; message?: string }>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "invalid_json" : `http_${res.status}`);
  }
  if (!res.ok || body.ok === false) {
    const detail = typeof body.message === "string" ? body.message : body.error;
    throw new Error(detail ?? `http_${res.status}`);
  }
  return body;
}

export async function fetchSoloOverview(): Promise<SoloOverview | null> {
  const res = await fetch(`${BASE}/overview`);
  const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<SoloOverview>;
  if (!res.ok || json.ok === false) {
    if (json.error === "booking_engine_unavailable") return null;
    throw new Error(json.error ?? `http_${res.status}`);
  }
  return json as SoloOverview;
}

export function rublesToMinor(rubles: number): number {
  return Math.round(rubles * 100);
}

export function minorToRublesInput(minor: number): string {
  return String(minor / 100);
}

export function parseRublesInput(raw: string): number {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid_price");
  return n;
}

/** Служебный city code для новой локации (скрыт от пользователя). */
export function slugCityCode(title: string): string {
  const latin = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  if (latin.length >= 2) return latin;
  return `loc-${Date.now().toString(36).slice(-6)}`;
}

export function pickDefaultSpecialist(specialists: SoloOverview["specialists"]): SoloOverview["specialists"][0] | null {
  const active = specialists.filter((s) => s.isActive);
  return active[0] ?? specialists[0] ?? null;
}

export async function ensureDefaultSpecialist(orgTitle: string | undefined): Promise<string> {
  const overview = await fetchSoloOverview();
  if (!overview) throw new Error("booking_engine_unavailable");
  const existing = pickDefaultSpecialist(overview.specialists);
  if (existing) return existing.id;
  const res = await apiJson<{ ok: boolean; specialist: { id: string } }>(`${BASE}/specialists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: orgTitle?.trim() || "Специалист" }),
  });
  return res.specialist.id;
}

export function isServiceAvailableAtLocation(
  overview: Pick<SoloOverview, "locationAvailability" | "specialistAvailability" | "specialists">,
  serviceId: string,
  branchId: string,
): boolean {
  const specialist = pickDefaultSpecialist(overview.specialists);
  if (!specialist) return false;
  const loc = overview.locationAvailability.find(
    (r) => r.serviceId === serviceId && r.branchId === branchId && r.isActive,
  );
  const spec = overview.specialistAvailability.find(
    (r) =>
      r.specialistId === specialist.id &&
      r.serviceId === serviceId &&
      r.branchId === branchId &&
      r.isActive,
  );
  return Boolean(loc && spec);
}

export async function setServiceLocationAvailability(
  serviceId: string,
  branchId: string,
  enabled: boolean,
  specialistId: string,
): Promise<void> {
  await apiJson(`${BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "service_location",
      serviceId,
      branchId,
      isActive: enabled,
    }),
  });
  await apiJson(`${BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "specialist_service",
      specialistId,
      serviceId,
      branchId,
      isActive: enabled,
    }),
  });
}
