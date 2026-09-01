import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExerciseCommentPreviewItemContent } from './ExerciseCommentPreviewItem';

afterEach(cleanup);

describe('ExerciseCommentPreviewItemContent', () => {
  it('shows exercise before comment and removes a duplicated date prefix', () => {
    render(
      <ExerciseCommentPreviewItemContent
        item={{
          patientUserId: 'patient-1',
          patientDisplayName: 'Костяков Дмитрий',
          instanceId: 'instance-1',
          stageItemId: 'item-1',
          stageItemTitle: 'Отведения бедра лежа на боку',
          latestMessage: {
            id: 'message-1',
            instanceStageItemId: 'item-1',
            patientUserId: 'patient-1',
            senderRole: 'patient',
            origin: 'patient_observation',
            body: '20.08.2026 Сделал по 13 раз, правая нога слабее',
            mediaFileId: null,
            supportMessageId: null,
            createdAt: '2026-08-20T04:49:00.000Z',
          },
          latestMessageAtLabel: '20 авг 07:49',
          href: '/app/doctor/patients/patient-1',
        }}
      />,
    );

    const exercise = screen.getByText('Отведения бедра лежа на боку');
    const comment = screen.getByText('Сделал по 13 раз, правая нога слабее');
    expect(screen.getByText('20 авг 07:49')).toBeInTheDocument();
    expect(
      exercise.compareDocumentPosition(comment) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/20\.08\.2026 Сделал/)).not.toBeInTheDocument();
  });
});
