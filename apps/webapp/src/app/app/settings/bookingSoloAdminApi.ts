import { apiJson } from "@/shared/lib/apiJson";
export { apiJson } from "@/shared/lib/apiJson";

const BASE = "/api/admin/booking-engine";

export const SOLO_BOOKING_UNAVAILABLE_MESSAGE =
  "Запись недоступна без подключения к базе данных.";

export type SoloOverview = {
  organizationId: string;
  organization: { id: string; title: string } | null;
  branches: {
    id: string;
    title: string;
    /** Short display name (e.g. «СПб», «Мск»). Migration 0117. */
    shortTitle: string | null;
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

/** Число активных услуг без хотя бы одной включённой пары услуга×локация. */
export function countServicesWithoutAvailability(
  activeServices: { id: string }[],
  activeBranchIds: Iterable<string>,
  overview: Pick<SoloOverview, "locationAvailability" | "specialistAvailability" | "specialists">,
): number {
  const branchIds = [...activeBranchIds];
  if (branchIds.length === 0) return activeServices.length;
  return activeServices.filter((service) =>
    !branchIds.some((branchId) => isServiceAvailableAtLocation(overview, service.id, branchId)),
  ).length;
}

/** Есть ли активные интервалы на weekday хотя бы одного из ближайших daysAhead дней. */
export function hasScheduleOnUpcomingDays(
  rows: { weekday: number; isActive: boolean }[],
  daysAhead = 7,
  fromDate = new Date(),
): boolean {
  const activeWeekdays = new Set(rows.filter((r) => r.isActive).map((r) => r.weekday));
  if (activeWeekdays.size === 0) return false;
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    if (activeWeekdays.has(d.getDay())) return true;
  }
  return false;
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

export function minuteToTimeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeLabelToMinute(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error("invalid_time");
  return h * 60 + m;
}

export function slugFieldKey(label: string, existing: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "field";
  let key = base;
  let i = 2;
  while (existing.includes(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}
