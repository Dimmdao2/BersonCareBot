import { describe, expect, it } from 'vitest';
import {
  phoneLinkConflictUserMessage,
  phoneLinkIntegratorMismatchUserMessage,
  phoneLinkNoBindingUserMessage,
  phoneLinkNoIntegratorIdentityUserMessage,
  phoneLinkSaveFailedUserMessage,
} from './phoneLinkUserMessages.js';

describe('phoneLinkUserMessages (TX path copy)', () => {
  it('phoneLinkSaveFailedUserMessage: neutral transient / indeterminate', () => {
    expect(phoneLinkSaveFailedUserMessage()).toBe(
      'Не удалось сохранить номер. Попробуйте позже или напишите в поддержку.',
    );
  });

  it('phoneLinkNoBindingUserMessage: telegram vs max', () => {
    expect(phoneLinkNoBindingUserMessage('telegram')).toContain('кнопка меню');
    expect(phoneLinkNoBindingUserMessage('max')).toBe(
      'Сначала откройте приложение из бота, затем снова поделитесь контактом.',
    );
  });

  it('phoneLinkNoIntegratorIdentityUserMessage: telegram vs generic', () => {
    expect(phoneLinkNoIntegratorIdentityUserMessage('telegram')).toContain('/start');
    expect(phoneLinkNoIntegratorIdentityUserMessage('max')).toContain('начните диалог');
  });

  it('phoneLinkIntegratorMismatchUserMessage: telegram vs max', () => {
    expect(phoneLinkIntegratorMismatchUserMessage('telegram')).toContain('приложением');
    expect(phoneLinkIntegratorMismatchUserMessage('max')).toBe('Не удалось сопоставить аккаунт. Напишите в поддержку.');
  });

  it('phoneLinkConflictUserMessage: telegram vs max', () => {
    expect(phoneLinkConflictUserMessage('telegram')).toContain('другому аккаунту Telegram');
    expect(phoneLinkConflictUserMessage('max')).toContain('другому аккаунту');
  });
});
