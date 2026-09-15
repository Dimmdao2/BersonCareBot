import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import type { VerifiedLeadApplicant } from '@/modules/leads/types';

/**
 * Опознание заявителя — ТОЛЬКО почта и код на неё. Канон идентичности §18в (владелец, 15.09):
 * «из заявки телефон не привязывается, значит все контакты кроме почты мы прикрепляем врачу к
 * заявке как метаданные, то есть он просто видит оставленные контакты… Совпадение телефона с чужой
 * учётной записью перестаёт быть событием идентичности, потому что телефон из заявки идентичностью
 * не становится».
 *
 * Телефон в заявке НЕ подтверждён ничем: его набрал кто угодно в публичной форме. Поэтому он не
 * выбирает учётную запись, не переносит почту на чужую и вообще не читает личности платформы — он
 * едет врачу полем заявки. Слияние остаётся в единственной точке, где его начинает сам человек, —
 * подтверждение контакта в своём кабинете.
 *
 * Проверка формата остаётся: поле телефона у клиники может быть обязательным (§9 плана заявок), и
 * мусор в нём — ошибка ввода (`400`), а не личность.
 */
export async function resolveVerifiedLeadApplicant(input: {
  organizationId: string;
  verifiedEmailUserId: string;
  emailNormalized: string;
  submittedPhone?: string | null;
  proof?: VerifiedLeadApplicant['proof'];
}): Promise<VerifiedLeadApplicant> {
  const phone = input.submittedPhone ? normalizePhone(input.submittedPhone) : null;
  if (phone && !isValidPhoneE164(phone)) throw new Error('invalid_lead_phone');
  return {
    platformUserId: input.verifiedEmailUserId,
    emailNormalized: input.emailNormalized,
    proof: input.proof ?? 'email_otp',
  } as VerifiedLeadApplicant;
}
