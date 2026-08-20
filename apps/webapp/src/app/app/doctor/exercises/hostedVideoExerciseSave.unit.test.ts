import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VideoAttachmentDurationResult } from '@/modules/media/videoDurationLimit';

/**
 * Решение владельца 19.08: «в упражнение нужно вставить ссылку на YouTube / RuTube / VK Видео /
 * Vimeo». Здесь проверяется поведение сохранения, а не форма кода: что именно ложится в
 * `lfk_exercise_media` после того, как врач вставил ссылку, и что видит врач, вставивший не то.
 */

type CreatedExerciseInput = { media?: { mediaUrl: string; mediaType: string }[] };

// Параметр объявлен намеренно: без него `mock.calls[0]` — пустой кортеж, и утверждение о том,
// что именно легло в media, пришлось бы протаскивать через приведение типа.
const createExercise = vi.fn(async (_input: CreatedExerciseInput) => ({ id: 'new-exercise' }));
const getVideoAttachmentDurationRejection = vi.fn(
  async (): Promise<VideoAttachmentDurationResult> => ({ ok: true }),
);

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: async () => ({
    session: { user: { userId: 'doctor-1' } },
  }),
}));

vi.mock('@/infra/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: async (
    _workspace: unknown,
    _label: string,
    fn: () => Promise<unknown>,
  ) => fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    references: { listActiveItemsByCategoryCode: async () => [] },
    lfkExercises: {
      createExercise,
      getExercise: async () => null,
      listExercises: async () => [],
      updateExercise: vi.fn(),
    },
    media: { getVideoAttachmentDurationRejection },
  }),
}));

const { bulkCreateExercisesFromMediaCore, saveDoctorExerciseCore } = await import('./actionsShared');

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  createExercise.mockClear();
  getVideoAttachmentDurationRejection.mockReset();
  getVideoAttachmentDurationRejection.mockResolvedValue({ ok: true });
});

describe('врач прикладывает к упражнению ссылку вместо файла', () => {
  it('сохраняет ролик отдельным видом медиа и в очищенном виде', async () => {
    const res = await saveDoctorExerciseCore(
      form({
        title: 'Приседания у стены',
        mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxx&t=90s&utm_source=tg',
        mediaType: 'hosted_video',
      }),
    );

    expect(res.ok).toBe(true);
    const [input] = createExercise.mock.calls[0];
    expect(input.media).toEqual([
      {
        mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaType: 'hosted_video',
        sortOrder: 0,
      },
    ]);
  });

  it('отказывает в ссылке на посторонний хост и называет причину', async () => {
    const res = await saveDoctorExerciseCore(
      form({
        title: 'Приседания у стены',
        mediaUrl: 'https://example.com/my-video.mp4',
        mediaType: 'hosted_video',
      }),
    );

    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('YouTube, RuTube, VK Видео и Vimeo'),
    });
    expect(createExercise).not.toHaveBeenCalled();
  });

  it('не превращает ссылку на хостинг в файл медиатеки', async () => {
    const res = await saveDoctorExerciseCore(
      form({
        title: 'Приседания у стены',
        mediaUrl: 'https://vkvideo.ru/video-12345_67890',
        mediaType: 'video',
      }),
    );

    /* `video` означает файл `/api/media/{uuid}`; ссылка хостинга под этим видом не проходит. */
    expect(res.ok).toBe(false);
    expect(createExercise).not.toHaveBeenCalled();
  });

  it('не принимает непробированный absolute URL под видом файла', async () => {
    const res = await saveDoctorExerciseCore(
      form({
        title: 'Мостик',
        mediaUrl: 'https://cdn.example.com/overlong-video.mp4',
        mediaType: 'video',
      }),
    );

    expect(res).toEqual({
      ok: false,
      error: expect.stringContaining('библиотек'),
    });
    expect(createExercise).not.toHaveBeenCalled();
    expect(getVideoAttachmentDurationRejection).not.toHaveBeenCalled();
  });

  it('файл из библиотеки сохраняется как раньше', async () => {
    const url = '/api/media/00000000-0000-4000-8000-0000000000c1';
    const res = await saveDoctorExerciseCore(
      form({ title: 'Мостик', mediaUrl: url, mediaType: 'video' }),
    );

    expect(res.ok).toBe(true);
    const [input] = createExercise.mock.calls[0];
    expect(input.media).toEqual([{ mediaUrl: url, mediaType: 'video', sortOrder: 0 }]);
  });

  it('не прикрепляет к упражнению файл длиннее десяти минут', async () => {
    getVideoAttachmentDurationRejection.mockResolvedValue({
      ok: false,
      code: 'video_duration_limit_exceeded',
      error: 'Файл для упражнения не может быть длиннее 10 минут.',
    });

    const res = await saveDoctorExerciseCore(
      form({
        title: 'Мостик',
        mediaUrl: '/api/media/00000000-0000-4000-8000-0000000000c1',
        mediaType: 'video',
      }),
    );

    expect(res).toEqual({ ok: false, error: expect.stringContaining('10 минут') });
    expect(createExercise).not.toHaveBeenCalled();
    expect(getVideoAttachmentDurationRejection).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-0000000000c1',
      'exercise',
    );
  });

  it('не обходит лимит через пакетное создание упражнений из библиотеки', async () => {
    getVideoAttachmentDurationRejection.mockResolvedValue({
      ok: false,
      code: 'video_duration_limit_exceeded',
      error: 'Файл для упражнения не может быть длиннее 10 минут.',
    });

    await expect(
      bulkCreateExercisesFromMediaCore([
        {
          title: 'Мостик',
          mediaUrl: '/api/media/00000000-0000-4000-8000-0000000000c1',
          mediaType: 'video',
        },
      ]),
    ).resolves.toEqual({ ok: true, created: 0, skippedLinked: 0, failed: 1, createdIds: [] });
    expect(createExercise).not.toHaveBeenCalled();
  });
});
