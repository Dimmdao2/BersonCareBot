import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = {
  doctor: '11111111-1111-4111-8111-111111111111',
  patient: '22222222-2222-4222-8222-222222222222',
  organizationA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  organizationC: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

type OrganizationState = {
  onSupport: boolean;
  commentsEnabled: boolean | null;
  mediaEnabled: boolean | null;
  directChatEnabled: boolean | null;
  portalEnabled: boolean | null;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  heightCm: number | null;
  weightKg: number | null;
};

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  recordPatientCardOpen: vi.fn(),
  buildAppDeps: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/identity/recordIdentityBoundaryCrossing', () => ({
  recordPatientCardOpen: fakes.recordPatientCardOpen,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import {
  GET as getSupport,
  PATCH as patchSupport,
} from '@/app/api/doctor/clients/[userId]/support-settings/route';
import { PATCH as patchFio } from '@/app/api/doctor/patients/[userId]/fio/route';
import {
  GET as getPhysical,
  PATCH as patchPhysical,
} from '@/app/api/doctor/patients/[userId]/physical/route';
import { GET as getPatient } from '@/app/api/doctor/patients/[userId]/route';
import {
  __resetInMemoryDoctorClientsForTest,
  inMemoryDoctorClientsPort,
} from '@/infra/repos/inMemoryDoctorClients';
import { createDoctorClientsService } from './service';
import { resolveClientChannelPolicy } from './supportPolicy';
import { defaultDoctorWorkspaceComposition } from '@/modules/system-settings/doctorWorkspaceComposition';

/** Organization channel defaults the GET handler projects next to the per-client overrides. */
const channelDefaults = {
  direct_chat: 'on_support',
  program_comments: 'on_support',
  program_media: 'on_support',
} as const;

let activeOrganizationId: string;
let stateByOrganization: Map<string, OrganizationState>;

function executeLastCallback(args: unknown[]): unknown {
  const callback = args.at(-1);
  if (typeof callback !== 'function') throw new Error('principal callback missing');
  return callback();
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/api/doctor/patients', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ userId: ids.patient }) };
}

function supportProfile(organizationId: string, state: OrganizationState) {
  return {
    organizationId,
    patientUserId: ids.patient,
    onSupport: state.onSupport,
    supportStartedAt: state.onSupport ? '2026-09-01T00:00:00.000Z' : null,
    commentsEnabled: state.commentsEnabled,
    mediaEnabled: state.mediaEnabled,
    directChatEnabled: state.directChatEnabled,
    portalEnabled: state.portalEnabled,
    updatedAt: '2026-09-07T00:00:00.000Z',
    updatedBy: ids.doctor,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeOrganizationId = ids.organizationA;
  stateByOrganization = new Map([
    [
      ids.organizationA,
      {
        onSupport: true,
        commentsEnabled: true,
        mediaEnabled: false,
        directChatEnabled: null,
        portalEnabled: null,
        birthDate: '1980-01-02',
        gender: 'female',
        heightCm: 165,
        weightKg: 60,
      },
    ],
    [
      ids.organizationB,
      {
        onSupport: false,
        commentsEnabled: false,
        mediaEnabled: true,
        directChatEnabled: null,
        portalEnabled: null,
        birthDate: '1990-03-04',
        gender: 'male',
        heightCm: 180,
        weightKg: 82,
      },
    ],
  ]);

  fakes.requireDoctorWorkspaceApiContext.mockImplementation(async () => ({
    ok: true,
    ctx: {
      organizationId: activeOrganizationId,
      session: { user: { userId: ids.doctor } },
    },
  }));
  fakes.withDoctorWorkspacePrincipal.mockImplementation((...args: unknown[]) =>
    executeLastCallback(args),
  );
  fakes.recordPatientCardOpen.mockResolvedValue(undefined);

  const doctorClients = {
    async getClientSupport(patientUserId: string, organizationId: string) {
      const state = stateByOrganization.get(organizationId);
      return state && patientUserId === ids.patient ? supportProfile(organizationId, state) : null;
    },
    async updateClientSupport(input: {
      patientUserId: string;
      organizationId: string;
      onSupport?: boolean;
      commentsEnabled?: boolean | null;
      mediaEnabled?: boolean | null;
      directChatEnabled?: boolean | null;
      portalEnabled?: boolean | null;
    }) {
      const current = stateByOrganization.get(input.organizationId) ?? {
        onSupport: false,
        commentsEnabled: null,
        mediaEnabled: null,
        directChatEnabled: null,
        portalEnabled: null,
        birthDate: null,
        gender: null,
        heightCm: null,
        weightKg: null,
      };
      const next = {
        ...current,
        ...(input.onSupport !== undefined ? { onSupport: input.onSupport } : {}),
        ...(input.commentsEnabled !== undefined ? { commentsEnabled: input.commentsEnabled } : {}),
        ...(input.mediaEnabled !== undefined ? { mediaEnabled: input.mediaEnabled } : {}),
        ...(input.directChatEnabled !== undefined
          ? { directChatEnabled: input.directChatEnabled }
          : {}),
        ...(input.portalEnabled !== undefined ? { portalEnabled: input.portalEnabled } : {}),
      };
      stateByOrganization.set(input.organizationId, next);
      return supportProfile(input.organizationId, next);
    },
    async getClientChannelPolicy(_patientUserId: string, context: { organizationId: string }) {
      const state = stateByOrganization.get(context.organizationId);
      return resolveClientChannelPolicy({
        profile: state ? supportProfile(context.organizationId, state) : null,
        defaults: channelDefaults,
      });
    },
    async getPatientProgramInteractionPolicy(
      patientUserId: string,
      context: { organizationId: string },
    ) {
      const state = stateByOrganization.get(context.organizationId);
      return {
        organizationId: context.organizationId,
        onSupport: state?.onSupport ?? false,
        commentsAllowed: state?.commentsEnabled ?? false,
        mediaAllowed: state?.mediaEnabled ?? false,
        patientUserId,
      };
    },
    async setPatientBirthDate(
      _patientUserId: string,
      organizationId: string,
      birthDate: string | null,
    ) {
      const current = stateByOrganization.get(organizationId);
      if (current) stateByOrganization.set(organizationId, { ...current, birthDate });
    },
    async setPatientGender(
      _patientUserId: string,
      organizationId: string,
      gender: 'male' | 'female' | null,
    ) {
      const current = stateByOrganization.get(organizationId);
      if (current) stateByOrganization.set(organizationId, { ...current, gender });
    },
    async setPatientNames() {},
    async getPatientPhysical(_patientUserId: string, organizationId: string) {
      const state = stateByOrganization.get(organizationId);
      return state ? { heightCm: state.heightCm, weightKg: state.weightKg } : null;
    },
    async setPatientPhysical(
      _patientUserId: string,
      organizationId: string,
      values: { heightCm?: number | null; weightKg?: number | null },
    ) {
      const current = stateByOrganization.get(organizationId);
      if (!current) return;
      stateByOrganization.set(organizationId, { ...current, ...values });
    },
    async getPatientCardHeader(_patientUserId: string, organizationId: string) {
      const state = stateByOrganization.get(organizationId);
      return state ? { birthDate: state.birthDate, gender: state.gender, organizationId } : null;
    },
  };

  fakes.buildAppDeps.mockReturnValue({
    orgEntitlements: {
      resolveMechanicAccess: async (_organizationId: string, mechanic: string) => ({
        mechanic,
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
    },
    systemSettings: {
      getDoctorWorkspaceComposition: async () => defaultDoctorWorkspaceComposition(),
      getDoctorWorkspaceClientDefaults: async () => ({ channelDefaults }),
    },
    doctorClientsPort: {
      getClientIdentityForOrganization: async () => ({ userId: ids.patient }),
    },
    doctorClients,
  });
});

describe('C3M-02 organization-scoped support identity', () => {
  it('keeps the in-memory repository keyed by organization and patient', async () => {
    __resetInMemoryDoctorClientsForTest();
    await inMemoryDoctorClientsPort.updateClientSupport({
      organizationId: ids.organizationA,
      patientUserId: ids.patient,
      onSupport: true,
      commentsEnabled: true,
      actorId: ids.doctor,
    });
    await inMemoryDoctorClientsPort.updateClientSupport({
      organizationId: ids.organizationB,
      patientUserId: ids.patient,
      onSupport: false,
      mediaEnabled: true,
      actorId: ids.doctor,
    });

    await expect(
      inMemoryDoctorClientsPort.getClientSupport(ids.patient, ids.organizationA),
    ).resolves.toMatchObject({
      organizationId: ids.organizationA,
      onSupport: true,
      commentsEnabled: true,
      mediaEnabled: null,
    });
    await expect(
      inMemoryDoctorClientsPort.getClientSupport(ids.patient, ids.organizationB),
    ).resolves.toMatchObject({
      organizationId: ids.organizationB,
      onSupport: false,
      commentsEnabled: null,
      mediaEnabled: true,
    });
    await expect(
      inMemoryDoctorClientsPort.getClientSupport(ids.patient, ids.organizationC),
    ).resolves.toBeNull();
  });

  it('preserves program interaction policy inside the selected organization', async () => {
    __resetInMemoryDoctorClientsForTest();
    const service = createDoctorClientsService({
      clientsPort: inMemoryDoctorClientsPort,
      getUpcomingAppointments: async () => [],
      listAppointmentHistoryForPhone: async () => [],
      listSymptomTrackings: async () => [],
      listSymptomEntries: async () => [],
      listLfkComplexes: async () => [],
      listLfkSessions: async () => [],
      getChannelCards: async () => [],
      listSupplementaryContacts: async () => [],
      getDoctorSupportDefault: async () => false,
    });
    await service.updateClientSupport({
      organizationId: ids.organizationA,
      patientUserId: ids.patient,
      onSupport: true,
      commentsEnabled: false,
      mediaEnabled: null,
      actorId: ids.doctor,
    });
    await service.updateClientSupport({
      organizationId: ids.organizationB,
      patientUserId: ids.patient,
      onSupport: false,
      commentsEnabled: true,
      mediaEnabled: true,
      actorId: ids.doctor,
    });

    await expect(
      service.getPatientProgramInteractionPolicy(ids.patient, {
        organizationId: ids.organizationA,
      }),
    ).resolves.toEqual({
      organizationId: ids.organizationA,
      onSupport: true,
      commentsAllowed: false,
      mediaAllowed: true,
    });
    await expect(
      service.getPatientProgramInteractionPolicy(ids.patient, {
        organizationId: ids.organizationB,
      }),
    ).resolves.toEqual({
      organizationId: ids.organizationB,
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: true,
    });
  });

  it('reads and changes only the selected organization support row, without cross-org fallback', async () => {
    const readA = await getSupport(new Request('http://test.local'), params());
    activeOrganizationId = ids.organizationB;
    const readB = await getSupport(new Request('http://test.local'), params());

    expect((await readA.json()).profile).toMatchObject({
      organizationId: ids.organizationA,
      onSupport: true,
      commentsEnabled: true,
      mediaEnabled: false,
    });
    expect((await readB.json()).profile).toMatchObject({
      organizationId: ids.organizationB,
      onSupport: false,
      commentsEnabled: false,
      mediaEnabled: true,
    });

    activeOrganizationId = ids.organizationA;
    await patchSupport(
      jsonRequest({ onSupport: false, commentsEnabled: false, mediaEnabled: false }),
      params(),
    );
    const changedA = await getSupport(new Request('http://test.local'), params());
    expect((await changedA.json()).profile).toMatchObject({
      organizationId: ids.organizationA,
      onSupport: false,
      commentsEnabled: false,
      mediaEnabled: false,
    });
    activeOrganizationId = ids.organizationB;
    const unchangedB = await getSupport(new Request('http://test.local'), params());
    expect((await unchangedB.json()).profile).toMatchObject({
      organizationId: ids.organizationB,
      onSupport: false,
      commentsEnabled: false,
      mediaEnabled: true,
    });

    activeOrganizationId = ids.organizationC;
    const absentC = await getSupport(new Request('http://test.local'), params());
    expect((await absentC.json()).profile).toMatchObject({
      organizationId: ids.organizationC,
      onSupport: false,
      commentsEnabled: null,
      mediaEnabled: null,
    });
    await patchSupport(jsonRequest({ onSupport: true }), params());
    expect(stateByOrganization.get(ids.organizationC)?.onSupport).toBe(true);
    expect(stateByOrganization.get(ids.organizationB)?.onSupport).toBe(false);
  });

  it('keeps birth date, gender, height and weight isolated for the same patient in two organizations', async () => {
    await patchFio(jsonRequest({ birthDate: '1975-05-06', gender: 'male' }), params());
    await patchPhysical(jsonRequest({ heightCm: 170, weightKg: 64 }), params());

    const physicalA = await getPhysical(new Request('http://test.local'), params());
    const headerA = await getPatient(new Request('http://test.local'), params());
    activeOrganizationId = ids.organizationB;
    const physicalB = await getPhysical(new Request('http://test.local'), params());
    const headerB = await getPatient(new Request('http://test.local'), params());

    expect(await physicalA.json()).toEqual({ ok: true, heightCm: 170, weightKg: 64 });
    expect((await headerA.json()).header).toMatchObject({
      organizationId: ids.organizationA,
      birthDate: '1975-05-06',
      gender: 'male',
    });
    expect(await physicalB.json()).toEqual({ ok: true, heightCm: 180, weightKg: 82 });
    expect((await headerB.json()).header).toMatchObject({
      organizationId: ids.organizationB,
      birthDate: '1990-03-04',
      gender: 'male',
    });
  });

  it('lets an explicit client exception be reset back to the changeable default', async () => {
    // The specialist first denies comments for this one client, against an `on_support` default.
    await patchSupport(jsonRequest({ commentsEnabled: false }), params());
    const denied = await (await getSupport(new Request('http://test.local'), params())).json();
    expect(denied.profile).toMatchObject({ commentsEnabled: false });
    expect(denied.channelPolicy).toMatchObject({ commentsAllowed: false });

    // «По умолчанию» sends an explicit null; it must clear the exception, not be dropped as absent.
    await patchSupport(jsonRequest({ commentsEnabled: null }), params());
    const restored = await (await getSupport(new Request('http://test.local'), params())).json();
    expect(restored.profile).toMatchObject({ commentsEnabled: null });
    // Back under the org default, which this client follows because they are in the group.
    expect(restored.channelPolicy).toMatchObject({ commentsAllowed: true });

    // An unrelated write must not silently re-materialise an exception.
    await patchSupport(jsonRequest({ onSupport: true }), params());
    const afterUnrelated = await (await getSupport(new Request('http://test.local'), params())).json();
    expect(afterUnrelated.profile).toMatchObject({ commentsEnabled: null, mediaEnabled: false });
  });
});
