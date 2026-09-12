import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_LABEL_VALUES,
  APPOINTMENT_TERMS_BY_LABEL,
  agreeWithAppointment,
  appointmentDeliveryFormatLabels,
  resolvePatientTerms,
} from './patientTerms';

/**
 * Методология владельца 12.09.2026 (T-G, `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`):
 * не пиннить финальную композированную фразу произвольным литералом — проверять сам резолвер и его
 * помощники против ИХ ЖЕ канонической таблицы `APPOINTMENT_TERMS_BY_LABEL` (данные, которые кодируют
 * решение владельца 12.09: ровно четыре слова — приём · сеанс · тренировка · сессия — и их формы).
 * Это проверка wiring против источника истины, а не хардкод копии текста, поэтому исключения §10a
 * не требуется.
 *
 * Оракул рода — САМ РУССКИЙ ЯЗЫК, записанный здесь ручным сопоставлением masculine/feminine →
 * форма, а не вызов `agreeWithAppointment`: если бы ожидание считалось через саму проверяемую
 * функцию, сломанная реализация («всегда мужской род» — ровно дефект I5 из аудита T-F) красила бы и
 * ожидание, и факт одинаково, и тест остался бы зелёным несмотря на поломку.
 */
describe.each(APPOINTMENT_LABEL_VALUES)('resolvePatientTerms wiring for «%s»', (label) => {
  const declared = APPOINTMENT_TERMS_BY_LABEL[label];

  it('resolvePatientTerms returns exactly the appointment-term fields declared for this label', () => {
    const resolved = resolvePatientTerms({ appointmentLabel: label });
    const {
      appointmentGender,
      appointmentSingularLabel,
      appointmentSingular,
      appointmentGenitive,
      appointmentDative,
      appointmentAccusative,
      appointmentInstrumental,
      appointmentPrepositional,
      appointmentPluralLabel,
      appointmentPlural,
      appointmentGenPlural,
      appointmentDativePlural,
      appointmentAccusativePlural,
      appointmentInstrumentalPlural,
      appointmentPrepositionalPlural,
    } = resolved;
    expect({
      appointmentGender,
      appointmentSingularLabel,
      appointmentSingular,
      appointmentGenitive,
      appointmentDative,
      appointmentAccusative,
      appointmentInstrumental,
      appointmentPrepositional,
      appointmentPluralLabel,
      appointmentPlural,
      appointmentGenPlural,
      appointmentDativePlural,
      appointmentAccusativePlural,
      appointmentInstrumentalPlural,
      appointmentPrepositionalPlural,
    }).toEqual(declared);
  });

  it('agreeWithAppointment picks the form matching the declared gender, not always the same one', () => {
    const expected = declared.appointmentGender === 'feminine' ? 'FEMININE_FORM' : 'MASCULINE_FORM';
    expect(agreeWithAppointment(declared, 'MASCULINE_FORM', 'FEMININE_FORM')).toBe(expected);
  });

  it('appointmentDeliveryFormatLabels composes in-person/online from the declared gender and word', () => {
    const adjective = declared.appointmentGender === 'feminine' ? 'Очная' : 'Очный';
    expect(appointmentDeliveryFormatLabels(declared)).toEqual({
      in_person: `${adjective} ${declared.appointmentSingular}`,
      online: `Онлайн-${declared.appointmentSingular}`,
    });
  });
});
