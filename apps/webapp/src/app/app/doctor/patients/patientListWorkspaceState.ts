import { routePaths } from '@/app-layer/routes/paths';

export const PATIENT_LIST_SEGMENT_KEYS = [
  'appointments',
  'on_support',
  'with_program',
  'visits',
  'cancellations',
  'reschedules',
  'memberships',
  'expired_memberships',
  'visited_month',
] as const;

export const PATIENT_LIST_CHANNELS = ['telegram', 'max', 'email', 'phone', 'web_push'] as const;

export type PatientListSegmentKey = (typeof PATIENT_LIST_SEGMENT_KEYS)[number];
export type PatientListChannel = (typeof PATIENT_LIST_CHANNELS)[number];
export type PatientListSort = 'recent_appointments' | 'fio';
export type PatientListSortDirection = 'asc' | 'desc';

export type PatientListWorkspaceState = {
  q: string;
  segments: PatientListSegmentKey[];
  channel: PatientListChannel | null;
  archivedOnly: boolean;
  sort: PatientListSort;
  sortDirection: PatientListSortDirection;
  selectedPatientId: string | null;
  scrollTop: number;
};

type SearchParamValue = string | string[] | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseSegments(
  value: string | undefined,
  legacySegment: string | undefined,
): PatientListSegmentKey[] {
  const requested = value?.split(',') ?? (legacySegment ? [legacySegment] : []);
  const allowed = new Set<string>(PATIENT_LIST_SEGMENT_KEYS);
  return Array.from(
    new Set(requested.filter((segment): segment is PatientListSegmentKey => allowed.has(segment))),
  );
}

function parseChannel(value: string | undefined): PatientListChannel | null {
  const normalized = value?.trim();
  return PATIENT_LIST_CHANNELS.find((channel) => channel === normalized) ?? null;
}

function parsePatientId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && UUID_RE.test(normalized) ? normalized.toLowerCase() : null;
}

function parseScrollTop(value: string | undefined): number {
  const normalized = value?.trim();
  if (!normalized || !/^(0|[1-9]\d*)$/.test(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function parsePatientListWorkspaceState(
  searchParams: Record<string, SearchParamValue>,
): PatientListWorkspaceState {
  const sortParam = firstParam(searchParams.sort);
  const directionParam = firstParam(searchParams.direction);

  return {
    q: firstParam(searchParams.q)?.trim() ?? '',
    segments: parseSegments(firstParam(searchParams.segments), firstParam(searchParams.segment)),
    channel: parseChannel(firstParam(searchParams.channel)),
    archivedOnly: firstParam(searchParams.archived) === 'true',
    sort: sortParam === 'fio' ? 'fio' : 'recent_appointments',
    sortDirection: directionParam === 'asc' ? 'asc' : 'desc',
    selectedPatientId: parsePatientId(firstParam(searchParams.selected)),
    scrollTop: parseScrollTop(firstParam(searchParams.scroll)),
  };
}

export function buildPatientListWorkspaceHref(state: PatientListWorkspaceState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.segments.length > 0) params.set('segments', state.segments.join(','));
  if (state.channel) params.set('channel', state.channel);
  if (state.archivedOnly) params.set('archived', 'true');
  if (state.sort !== 'recent_appointments') params.set('sort', state.sort);
  if (state.sortDirection !== 'desc') params.set('direction', state.sortDirection);
  const selectedPatientId = parsePatientId(state.selectedPatientId ?? undefined);
  if (selectedPatientId) params.set('selected', selectedPatientId);
  if (Number.isSafeInteger(state.scrollTop) && state.scrollTop > 0)
    params.set('scroll', String(state.scrollTop));
  const query = params.toString();
  return query ? `${routePaths.doctorPatients}?${query}` : routePaths.doctorPatients;
}

export function patientCardHrefWithReturnTo(
  userId: string,
  state: PatientListWorkspaceState,
): string {
  const params = new URLSearchParams({ returnTo: buildPatientListWorkspaceHref(state) });
  return `${routePaths.doctorPatientCard(userId)}?${params.toString()}`;
}

export function sanitizePatientListReturnHref(value: SearchParamValue): string {
  const raw = firstParam(value);
  if (!raw) return routePaths.doctorPatients;

  try {
    const base = new URL('https://bersoncare.local');
    const resolved = new URL(raw, base);
    if (resolved.origin !== base.origin || resolved.pathname !== routePaths.doctorPatients) {
      return routePaths.doctorPatients;
    }
    const canonicalState = parsePatientListWorkspaceState(
      Object.fromEntries(resolved.searchParams.entries()),
    );
    return buildPatientListWorkspaceHref(canonicalState);
  } catch {
    return routePaths.doctorPatients;
  }
}
