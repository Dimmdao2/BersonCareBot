import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseWriteOptions } from '@/modules/courses/service';
import type { RecommendationWriteOptions } from '@/modules/recommendations/service';
import type { TreatmentProgramTemplateWriteOptions } from '@/modules/treatment-program/service';
import type { ClinicalTestWriteOptions, TestSetWriteOptions } from '@/modules/tests/service';

const {
  createCourseMock,
  createRecommendationMock,
  createClinicalTestMock,
  createTemplateMock,
  addStageItemMock,
  updateTestSetMock,
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    createCourseMock: vi.fn(),
    createRecommendationMock: vi.fn(),
    createClinicalTestMock: vi.fn(),
    createTemplateMock: vi.fn(),
    addStageItemMock: vi.fn(),
    updateTestSetMock: vi.fn(),
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    ),
    principalState,
  };
});

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    courses: {
      createCourse: createCourseMock,
    },
    recommendations: {
      createRecommendation: createRecommendationMock,
    },
    clinicalTests: {
      createClinicalTest: createClinicalTestMock,
    },
    testSets: {
      updateTestSet: updateTestSetMock,
    },
    treatmentProgram: {
      createTemplate: createTemplateMock,
      addStageItem: addStageItemMock,
    },
    orgEntitlements: {
      getSnapshot: vi.fn(async () => ({
        tariff: { mechanics: { courses: true }, quotas: {}, includedSeats: null },
        overrides: [],
        access: { lifecycle: 'active', tariffId: null, source: 'compatibility' },
      })),
      getTariffForOrg: vi.fn(async () => ({ mechanics: { courses: true }, includedSeats: null })),
      listOverrides: vi.fn(async () => []),
    },
  }),
}));

import { POST as postCourse } from './courses/route';
import { POST as postRecommendation } from './recommendations/route';
import { POST as postClinicalTest } from './clinical-tests/route';
import { PATCH as patchTestSet } from './test-sets/[id]/route';
import { POST as postTemplate } from './treatment-program-templates/route';
import { POST as postStageItem } from './treatment-program-templates/stages/[stageId]/items/route';

const workspace = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  session: {
    user: {
      userId: 'doctor-1',
    },
  },
};

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('doctor catalog API write principal behavior', () => {
  beforeEach(() => {
    createCourseMock.mockReset();
    createRecommendationMock.mockReset();
    createClinicalTestMock.mockReset();
    createTemplateMock.mockReset();
    addStageItemMock.mockReset();
    updateTestSetMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    principalState.inside = false;

    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspace });
  });

  it('POST /courses keeps all course reads and the mutation inside the selected workspace principal', async () => {
    createCourseMock.mockImplementation(async (_input: unknown, options: CourseWriteOptions) => {
      expect(principalState.inside).toBe(true);
      expect(options.runCourseWrite).toBeDefined();
      return options.runCourseWrite!(async () => {
        expect(principalState.inside).toBe(true);
        return { id: 'course-1' };
      });
    });

    const res = await postCourse(
      jsonRequest('http://localhost/api/doctor/courses', {
        title: 'Course',
        programTemplateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.courses.create',
      expect.any(Function),
    );
  });

  it('POST /recommendations executes create through the recommendation principal option', async () => {
    createRecommendationMock.mockImplementation(
      async (_input: unknown, _actorId: unknown, options: RecommendationWriteOptions) => {
        expect(principalState.inside).toBe(false);
        expect(options.runRecommendationWrite).toBeDefined();
        return options.runRecommendationWrite!(async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'rec-1' };
        });
      },
    );

    const res = await postRecommendation(
      jsonRequest('http://localhost/api/doctor/recommendations', { title: 'R', bodyMd: '' }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.recommendations.create',
      expect.any(Function),
    );
  });

  it('POST /clinical-tests executes create through the clinical-test principal option', async () => {
    createClinicalTestMock.mockImplementation(
      async (_input: unknown, _actorId: unknown, options: ClinicalTestWriteOptions) => {
        expect(principalState.inside).toBe(false);
        expect(options.runClinicalTestWrite).toBeDefined();
        return options.runClinicalTestWrite!(async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'test-1' };
        });
      },
    );

    const res = await postClinicalTest(
      jsonRequest('http://localhost/api/doctor/clinical-tests', { title: 'T' }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.clinical-tests.create',
      expect.any(Function),
    );
  });

  it('PATCH /test-sets/:id executes update through the test-set principal option', async () => {
    updateTestSetMock.mockImplementation(
      async (_id: unknown, _input: unknown, options: TestSetWriteOptions) => {
        expect(principalState.inside).toBe(false);
        expect(options.runTestSetWrite).toBeDefined();
        return options.runTestSetWrite!(async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'set-1' };
        });
      },
    );

    const res = await patchTestSet(
      jsonRequest('http://localhost/api/doctor/test-sets/set-1', { title: 'S' }, 'PATCH'),
      { params: Promise.resolve({ id: 'set-1' }) },
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.test-sets.update',
      expect.any(Function),
    );
  });

  it('POST /treatment-program-templates executes create through the template principal option', async () => {
    createTemplateMock.mockImplementation(
      async (_input: unknown, _actorId: unknown, options: TreatmentProgramTemplateWriteOptions) => {
        expect(principalState.inside).toBe(false);
        expect(options.runTemplateWrite).toBeDefined();
        return options.runTemplateWrite!(async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'template-1' };
        });
      },
    );

    const res = await postTemplate(
      jsonRequest('http://localhost/api/doctor/treatment-program-templates', {
        title: 'Template',
      }),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.treatment-program-templates.create',
      expect.any(Function),
    );
  });

  it('POST /treatment-program-templates/stages/:id/items executes create through the template principal option', async () => {
    addStageItemMock.mockImplementation(
      async (_stageId: unknown, _input: unknown, options: TreatmentProgramTemplateWriteOptions) => {
        expect(principalState.inside).toBe(false);
        expect(options.runTemplateWrite).toBeDefined();
        return options.runTemplateWrite!(async () => {
          expect(principalState.inside).toBe(true);
          return { id: 'stage-item-1' };
        });
      },
    );

    const res = await postStageItem(
      jsonRequest('http://localhost/api/doctor/treatment-program-templates/stages/stage-1/items', {
        itemType: 'recommendation',
        itemRefId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
      { params: Promise.resolve({ stageId: 'stage-1' }) },
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.treatment-program-templates.stage-items.create',
      expect.any(Function),
    );
  });
});
