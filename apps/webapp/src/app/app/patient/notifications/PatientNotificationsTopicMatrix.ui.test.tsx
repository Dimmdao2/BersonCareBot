import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTopicChannelNotificationEnabled } from './notificationPrefsActions';
import { PatientNotificationsTopicMatrix } from './PatientNotificationsTopicMatrix';

vi.mock('./notificationPrefsActions', () => ({
  setTopicChannelNotificationEnabled: vi.fn(),
}));

const setTopicChannelNotificationEnabledMock = vi.mocked(setTopicChannelNotificationEnabled);

describe('patient notification topic matrix', () => {
  beforeEach(() => {
    setTopicChannelNotificationEnabledMock.mockReset();
  });

  it('keeps other switches interactive while one preference is being saved', async () => {
    let finishFirstSave: ((value: { ok: true }) => void) | undefined;
    setTopicChannelNotificationEnabledMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstSave = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });

    render(
      <PatientNotificationsTopicMatrix
        pushEffective={false}
        initialTopics={[
          {
            topicId: 'appointment_reminder',
            displayTitle: 'Напоминание',
            topicMasterEnabled: true,
            channels: [{ code: 'email', label: 'Email', isEnabled: true }],
          },
          {
            topicId: 'appointment_created',
            displayTitle: 'Новая запись',
            topicMasterEnabled: true,
            channels: [{ code: 'email', label: 'Email', isEnabled: true }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Напоминание: Email' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Новая запись: Email' }));

    expect(setTopicChannelNotificationEnabledMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('switch', { name: 'Новая запись: Email' })).not.toBeChecked();

    finishFirstSave?.({ ok: true });
    await waitFor(() => {
      expect(setTopicChannelNotificationEnabledMock).toHaveBeenNthCalledWith(
        2,
        'appointment_created',
        'email',
        false,
      );
    });
  });
});
