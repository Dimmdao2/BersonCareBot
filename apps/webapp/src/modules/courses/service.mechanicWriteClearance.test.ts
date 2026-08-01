import { describe, expect, it } from 'vitest';
import { createCoursesService } from './service';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import type { CourseIntroPagesPort, CoursesPort } from './ports';
import type { CourseRecord } from './types';

const programTemplateId = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const created: unknown[] = [];
  const courses: CoursesPort = {
    listPublished: async () => [],
    listAssignedToPatient: async () => [],
    listForDoctor: async () => [],
    getById: async () => null,
    create: async (input) => {
      created.push(input);
      return { id: 'course-1', ...input } as unknown as CourseRecord;
    },
    update: async () => null,
    getCourseUsageSummary: async () => null,
  };
  const introPages: CourseIntroPagesPort = { getById: async () => null };
  const service = createCoursesService({
    courses,
    introPages,
    assertWriteClearance: assertMechanicWriteClearance,
    assignTemplateToPatient: async () => ({}),
  });
  return { service, created };
}

describe('courses service — 3.2 physical door (proof for a real write path)', () => {
  it('refuses createCourse when no requireEntitlementForMutation("courses") decision ran first', async () => {
    const { service, created } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.createCourse({ title: 'Курс', programTemplateId }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(created).toHaveLength(0);
  });

  it('proceeds once the mutation guard cleared "courses" for this continuation', async () => {
    const { service, created } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('courses');
      const course = await service.createCourse({ title: 'Курс', programTemplateId });
      expect(course.id).toBe('course-1');
    });
    expect(created).toHaveLength(1);
  });
});
