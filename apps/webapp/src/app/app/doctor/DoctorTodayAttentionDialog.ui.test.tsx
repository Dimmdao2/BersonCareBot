import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/doctor/DoctorModal', () => ({
  DoctorModal: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock('./doctorProgramDiscussionMarkRead', () => ({ markDoctorProgramDiscussionRead: vi.fn() }));
vi.mock(
  '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/doctorProgramDiscussionReply',
  () => ({ sendDoctorProgramDiscussionReply: vi.fn() }),
);
vi.mock('./comments/ExerciseCommentPreviewItem', () => ({
  ExerciseCommentPreviewItemContent: () => null,
}));

import { DoctorTodayAttentionDialog } from './DoctorTodayAttentionDialog';

afterEach(cleanup);

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  newIntakeRequests: [],
  unreadConversations: [
    {
      conversationId: 'conversation-1',
      displayName: 'Пациент',
      phoneNormalized: null,
      lastMessageAtLabel: 'сегодня, 10:00',
      lastMessageText: 'Нужна помощь',
      lastMessagePreview: 'Нужна помощь',
      unreadFromUserCount: 1,
      href: '/app/doctor/messages',
    },
  ],
  unreadTotal: 1,
  pendingProgramTests: [
    {
      attemptId: 'attempt-1',
      patientUserId: 'patient-1',
      patientDisplayName: 'Пациент',
      instanceId: 'instance-1',
      instanceTitle: 'Программа',
      stageTitle: 'Этап 1',
      pendingCount: 1,
      submittedAtLabel: 'сегодня, 10:00',
      href: '/app/doctor/patients/patient-1',
    },
  ],
  pendingProgramTestsTotal: 1,
  pendingProgramTestsTruncated: false,
  exerciseCommentAttentionItems: [],
  exerciseCommentAttentionTotal: 0,
  exerciseCommentAttentionTruncated: false,
  onExerciseCommentResolved: vi.fn(),
};

describe('DoctorTodayAttentionDialog', () => {
  it('keeps messages and tests-to-review available as independent Today attention dialogs', () => {
    const { rerender } = render(<DoctorTodayAttentionDialog {...baseProps} kind="messages" />);
    expect(screen.getByRole('region', { name: 'Сообщения' })).toHaveTextContent('Нужна помощь');

    rerender(<DoctorTodayAttentionDialog {...baseProps} kind="pendingTests" />);
    expect(screen.getByRole('region', { name: 'Тесты к проверке' })).toHaveTextContent(
      'Попыток без оценки: 1',
    );
  });
});
