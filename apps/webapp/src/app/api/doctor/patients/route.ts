/**
 * GET /api/doctor/patients — список пациентов с фильтрами и поиском.
 *
 * Query params:
 *   q          — строка поиска (имя, фамилия, телефон, email, telegram, MAX)
 *   segment    — on_support | with_program | visited_month | memberships | expired_memberships | new | former | subscriber | cancellations | reschedules
 *   channel    — telegram | max | email | phone
 *   archived   — "true" для архивных пациентов
 *
 * Response: { clients: ClientListItem[] }
 */
import { NextResponse } from 'next/server';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { DoctorClientsFilters } from '@/modules/doctor-clients/ports';

export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const segment = searchParams.get('segment');
  const channel = searchParams.get('channel');
  const archived = searchParams.get('archived') === 'true';

  const filters: DoctorClientsFilters = {
    search: q || undefined,
    archivedOnly: archived,
    organizationId: gate.ctx.organizationId,
    visibilityActor: gate.ctx,
    viewerUserId: gate.ctx.session.user.userId,
    // Segment
    supportStatus: segment === 'on_support' ? 'on' : undefined,
    hasActiveTreatmentProgram: segment === 'with_program' ? true : undefined,
    visitedThisCalendarMonth: segment === 'visited_month' ? true : undefined,
    hasMemberships: segment === 'memberships' ? true : undefined,
    hasExpiredMemberships: segment === 'expired_memberships' ? true : undefined,
    isNew: segment === 'new' ? true : undefined,
    isFormer: segment === 'former' ? true : undefined,
    isSubscriberOnly:
      segment === 'subscriber' || segment === 'without_appointments' ? true : undefined,
    hasCancellations: segment === 'cancellations' ? true : undefined,
    hasReschedules: segment === 'reschedules' ? true : undefined,
    hasUpcomingAppointment: segment === 'appointments' ? true : undefined,
    // Channel
    hasTelegram: channel === 'telegram' ? true : undefined,
    hasMax: channel === 'max' ? true : undefined,
    hasEmail: channel === 'email' ? true : undefined,
    hasPhone: channel === 'phone' ? true : undefined,
  };

  const deps = buildAppDeps();
  const clients = await deps.doctorClients.listClients(filters);

  return NextResponse.json({ clients });
}
