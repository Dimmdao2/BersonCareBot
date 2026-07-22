import { routePaths } from "@/app-layer/routes/paths";

export const PATIENT_LIST_SEGMENT_KEYS = [
  "appointments",
  "on_support",
  "with_program",
  "without_appointments",
  "visits",
  "former",
  "cancellations",
  "reschedules",
  "memberships",
  "expired_memberships",
  "visited_month",
] as const;

export type PatientListSegmentKey = (typeof PATIENT_LIST_SEGMENT_KEYS)[number];
export type PatientListSort = "recent_appointments" | "fio";
export type PatientListSortDirection = "asc" | "desc";

export type PatientListWorkspaceState = {
  q: string;
  segments: PatientListSegmentKey[];
  channel: string | null;
  archivedOnly: boolean;
  sort: PatientListSort;
  sortDirection: PatientListSortDirection;
  selectedPatientId: string | null;
  scrollTop: number;
};

type SearchParamValue = string | string[] | undefined;

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseSegments(value: string | undefined, legacySegment: string | undefined): PatientListSegmentKey[] {
  const requested = value?.split(",") ?? (legacySegment ? [legacySegment] : []);
  const allowed = new Set<string>(PATIENT_LIST_SEGMENT_KEYS);
  return Array.from(new Set(requested.filter((segment): segment is PatientListSegmentKey => allowed.has(segment))));
}

export function parsePatientListWorkspaceState(
  searchParams: Record<string, SearchParamValue>,
): PatientListWorkspaceState {
  const sortParam = firstParam(searchParams.sort);
  const directionParam = firstParam(searchParams.direction);
  const scrollParam = Number.parseInt(firstParam(searchParams.scroll) ?? "0", 10);

  return {
    q: firstParam(searchParams.q)?.trim() ?? "",
    segments: parseSegments(firstParam(searchParams.segments), firstParam(searchParams.segment)),
    channel: firstParam(searchParams.channel)?.trim() || null,
    archivedOnly: firstParam(searchParams.archived) === "true",
    sort: sortParam === "fio" ? "fio" : "recent_appointments",
    sortDirection: directionParam === "asc" ? "asc" : "desc",
    selectedPatientId: firstParam(searchParams.selected)?.trim() || null,
    scrollTop: Number.isFinite(scrollParam) && scrollParam > 0 ? scrollParam : 0,
  };
}

export function buildPatientListWorkspaceHref(state: PatientListWorkspaceState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.segments.length > 0) params.set("segments", state.segments.join(","));
  if (state.channel) params.set("channel", state.channel);
  if (state.archivedOnly) params.set("archived", "true");
  if (state.sort !== "recent_appointments") params.set("sort", state.sort);
  if (state.sortDirection !== "desc") params.set("direction", state.sortDirection);
  if (state.selectedPatientId) params.set("selected", state.selectedPatientId);
  if (state.scrollTop > 0) params.set("scroll", String(Math.round(state.scrollTop)));
  const query = params.toString();
  return query ? `${routePaths.doctorPatients}?${query}` : routePaths.doctorPatients;
}

export function patientCardHrefWithReturnTo(userId: string, state: PatientListWorkspaceState): string {
  const params = new URLSearchParams({ returnTo: buildPatientListWorkspaceHref(state) });
  return `${routePaths.doctorPatientCard(userId)}?${params.toString()}`;
}

export function sanitizePatientListReturnHref(value: SearchParamValue): string {
  const raw = firstParam(value);
  if (!raw) return routePaths.doctorPatients;

  try {
    const base = new URL("https://bersoncare.local");
    const resolved = new URL(raw, base);
    if (resolved.origin !== base.origin || resolved.pathname !== routePaths.doctorPatients) {
      return routePaths.doctorPatients;
    }
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return routePaths.doctorPatients;
  }
}
