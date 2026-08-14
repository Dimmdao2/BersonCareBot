import { describe, expect, it, vi } from 'vitest';
import {
  loadDoctorAllCommentPatients,
  type LoadDoctorAllCommentPatientsDeps,
} from './loadDoctorAllCommentPatients';

const VISIBLE_PATIENT_ID = '51000000-0000-4000-8000-000000000001';
const HIDDEN_PATIENT_ID = '51000000-0000-4000-8000-000000000002';
const VIEWER_USER_ID = '51000000-0000-4000-8000-000000000003';
const ORGANIZATION_ID = '51000000-0000-4000-8000-000000000004';

describe('loadDoctorAllCommentPatients specialist visibility', () => {
  it('passes only specialist-visible patient ids to the comments query and drops foreign rows', async () => {
    const listExerciseCommentsForDoctor = vi.fn(async () => [
      { patientUserId: VISIBLE_PATIENT_ID, stageItemId: 'visible-stage' },
      { patientUserId: HIDDEN_PATIENT_ID, stageItemId: 'hidden-stage' },
    ]);
    const deps = {
      doctorClientsPort: {
        listClients: vi.fn(async () => [
          {
            userId: VISIBLE_PATIENT_ID,
            displayName: 'Visible patient',
            phone: null,
            bindings: {},
            isOnSupport: false,
          },
        ]),
      },
      programItemDiscussion: {
        listExerciseCommentsForDoctor,
        listUnreadCountsForViewerByStageItems: vi.fn(async () => [
          { stageItemId: 'visible-stage', unread: 1 },
          { stageItemId: 'hidden-stage', unread: 1 },
        ]),
      },
    } satisfies LoadDoctorAllCommentPatientsDeps;

    const result = await loadDoctorAllCommentPatients(deps, {
      viewerUserId: VIEWER_USER_ID,
      organizationId: ORGANIZATION_ID,
      visibilityActor: {
        membershipRole: 'doctor',
        specialistId: '51000000-0000-4000-8000-000000000005',
        canManageAllSpecialists: false,
      },
    });

    expect(listExerciseCommentsForDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ patientUserIds: [VISIBLE_PATIENT_ID] }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        patientUserId: VISIBLE_PATIENT_ID,
        displayName: 'Visible patient',
        unreadCount: 1,
      }),
    ]);
  });
});
