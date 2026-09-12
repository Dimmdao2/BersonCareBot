/**
 * Резолвер терминологии организации: как она называет человека (`patient_label`, scope=doctor) и как
 * называет событие записи (`appointment_label`, scope=doctor).
 *
 * `patient_label` — двоичный тумблер: `"клиент"` → «Клиенты», всё остальное → «Пациенты».
 * `appointment_label` — выбор из четырёх: «приём» (дефолт, сегодняшнее поведение), «сеанс»,
 * «тренировка», «сессия». Решение владельца 12.09.2026; «занятие» и «встреча» в набор не входят.
 * Резолвер — единственное место логики; всё остальное импортирует отсюда.
 *
 * Нормализация: trim + toLowerCase, чтобы «Клиент» или «КЛИЕНТ» работал так же, как «клиент»;
 * у слова о событии записи дополнительно «ё» приводится к «е», иначе «прием» не узнаётся.
 */

/**
 * Готовые формы слова о событии записи. Падежи и род заданы ДАННЫМИ (таблица ниже), а не выводятся
 * из основы: у «приём/сеанс» мужской род, у «тренировка/сессия» женский, и родительный с винительным
 * у них разные. Без готовых форм каждая надпись («Формат приёма», «Вы записаны на приём», «Журнал
 * прошедших приёмов») склеивала бы падеж руками у себя в файле — ровно то, что этот слой убирает.
 */
export type AppointmentTerms = {
  /** Род слова — для согласования прилагательных («Очный приём» / «Очная тренировка»). */
  appointmentGender: 'masculine' | 'feminine';
  /** Именительный ед.ч. с заглавной: «Приём», «Тренировка». */
  appointmentSingularLabel: string;
  /** Именительный ед.ч.: «приём», «тренировка». */
  appointmentSingular: string;
  /** Родительный ед.ч.: «приёма», «тренировки» — «Формат приёма», «Новое время приёма». */
  appointmentGenitive: string;
  /** Дательный ед.ч.: «приёму», «тренировке». */
  appointmentDative: string;
  /** Винительный ед.ч.: «приём», «тренировку» — «Вы записаны на приём». */
  appointmentAccusative: string;
  /** Творительный ед.ч.: «приёмом», «тренировкой». */
  appointmentInstrumental: string;
  /** Предложный ед.ч.: «приёме», «тренировке» — «напоминание о приёме». */
  appointmentPrepositional: string;
  /** Именительный мн.ч. с заглавной: «Приёмы», «Тренировки». */
  appointmentPluralLabel: string;
  /** Именительный мн.ч.: «приёмы», «тренировки». */
  appointmentPlural: string;
  /** Родительный мн.ч.: «приёмов», «тренировок» — «Журнал прошедших приёмов». */
  appointmentGenPlural: string;
  /** Дательный мн.ч.: «приёмам», «тренировкам». */
  appointmentDativePlural: string;
  /** Винительный мн.ч.: «приёмы», «тренировки». */
  appointmentAccusativePlural: string;
  /** Творительный мн.ч.: «приёмами», «тренировками». */
  appointmentInstrumentalPlural: string;
  /** Предложный мн.ч.: «приёмах», «тренировках». */
  appointmentPrepositionalPlural: string;
};

export type PatientTerms = AppointmentTerms & {
  /** Именительный падеж мн.ч.: «Пациенты» или «Клиенты». */
  patientPluralLabel: string;
  /** Родительный падеж мн.ч.: «пациентов» или «клиентов». */
  patientGenPlural: string;
  /** Именительный падеж ед.ч.: «Пациент» или «Клиент». */
  patientSingularLabel: string;
  /** Именительный падеж ед.ч. со строчной буквы: «пациент» или «клиент». */
  patientSingularLower: string;
  /** Родительный падеж ед.ч.: «пациента» или «клиента». */
  patientGenitive: string;
  /** Дательный падеж ед.ч.: «пациенту» или «клиенту». */
  patientDative: string;
  /** Дательный падеж мн.ч.: «пациентам» или «клиентам». */
  patientDativePlural: string;
  /** Творительный падеж ед.ч.: «пациентом» или «клиентом». */
  patientInstrumental: string;
  /** Творительный падеж мн.ч.: «пациентами» или «клиентами». */
  patientInstrumentalPlural: string;
  /** Chosen display name for the one `doctor_patient_support.on_support` group. */
  supportGroupLabel: 'Избранные' | 'На сопровождении';
};

export const PATIENT_LABEL_VALUES = ['пациент', 'клиент'] as const;
export type PatientLabelValue = (typeof PATIENT_LABEL_VALUES)[number];

export const APPOINTMENT_LABEL_KEY = 'appointment_label' as const;
/** Ровно четыре значения, названные владельцем 12.09.2026. Дефолт — «приём». */
export const APPOINTMENT_LABEL_VALUES = ['приём', 'сеанс', 'тренировка', 'сессия'] as const;
export type AppointmentLabelValue = (typeof APPOINTMENT_LABEL_VALUES)[number];

/** Ключ поиска — без «ё», поэтому и «приём», и «прием» приводятся к каноническому «приём». */
const APPOINTMENT_LABEL_BY_YO_FREE_FORM: Readonly<Record<string, AppointmentLabelValue>> = {
  прием: 'приём',
  сеанс: 'сеанс',
  тренировка: 'тренировка',
  сессия: 'сессия',
};

const APPOINTMENT_TERMS_BY_LABEL: Readonly<Record<AppointmentLabelValue, AppointmentTerms>> = {
  приём: {
    appointmentGender: 'masculine',
    appointmentSingularLabel: 'Приём',
    appointmentSingular: 'приём',
    appointmentGenitive: 'приёма',
    appointmentDative: 'приёму',
    appointmentAccusative: 'приём',
    appointmentInstrumental: 'приёмом',
    appointmentPrepositional: 'приёме',
    appointmentPluralLabel: 'Приёмы',
    appointmentPlural: 'приёмы',
    appointmentGenPlural: 'приёмов',
    appointmentDativePlural: 'приёмам',
    appointmentAccusativePlural: 'приёмы',
    appointmentInstrumentalPlural: 'приёмами',
    appointmentPrepositionalPlural: 'приёмах',
  },
  сеанс: {
    appointmentGender: 'masculine',
    appointmentSingularLabel: 'Сеанс',
    appointmentSingular: 'сеанс',
    appointmentGenitive: 'сеанса',
    appointmentDative: 'сеансу',
    appointmentAccusative: 'сеанс',
    appointmentInstrumental: 'сеансом',
    appointmentPrepositional: 'сеансе',
    appointmentPluralLabel: 'Сеансы',
    appointmentPlural: 'сеансы',
    appointmentGenPlural: 'сеансов',
    appointmentDativePlural: 'сеансам',
    appointmentAccusativePlural: 'сеансы',
    appointmentInstrumentalPlural: 'сеансами',
    appointmentPrepositionalPlural: 'сеансах',
  },
  тренировка: {
    appointmentGender: 'feminine',
    appointmentSingularLabel: 'Тренировка',
    appointmentSingular: 'тренировка',
    appointmentGenitive: 'тренировки',
    appointmentDative: 'тренировке',
    appointmentAccusative: 'тренировку',
    appointmentInstrumental: 'тренировкой',
    appointmentPrepositional: 'тренировке',
    appointmentPluralLabel: 'Тренировки',
    appointmentPlural: 'тренировки',
    appointmentGenPlural: 'тренировок',
    appointmentDativePlural: 'тренировкам',
    appointmentAccusativePlural: 'тренировки',
    appointmentInstrumentalPlural: 'тренировками',
    appointmentPrepositionalPlural: 'тренировках',
  },
  сессия: {
    appointmentGender: 'feminine',
    appointmentSingularLabel: 'Сессия',
    appointmentSingular: 'сессия',
    appointmentGenitive: 'сессии',
    appointmentDative: 'сессии',
    appointmentAccusative: 'сессию',
    appointmentInstrumental: 'сессией',
    appointmentPrepositional: 'сессии',
    appointmentPluralLabel: 'Сессии',
    appointmentPlural: 'сессии',
    appointmentGenPlural: 'сессий',
    appointmentDativePlural: 'сессиям',
    appointmentAccusativePlural: 'сессии',
    appointmentInstrumentalPlural: 'сессиями',
    appointmentPrepositionalPlural: 'сессиях',
  },
};

export const SUPPORT_GROUP_LABEL_KEY = 'support_group_label' as const;
export const SUPPORT_GROUP_LABEL_VALUES = ['favorites', 'on_support'] as const;
export type SupportGroupLabelValue = (typeof SUPPORT_GROUP_LABEL_VALUES)[number];

export function normalizePatientLabel(value: unknown): PatientLabelValue | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (PATIENT_LABEL_VALUES as readonly string[]).includes(normalized)
    ? (normalized as PatientLabelValue)
    : null;
}

export function normalizeSupportGroupLabel(value: unknown): SupportGroupLabelValue | null {
  return typeof value === 'string' &&
    (SUPPORT_GROUP_LABEL_VALUES as readonly string[]).includes(value)
    ? (value as SupportGroupLabelValue)
    : null;
}

export function normalizeAppointmentLabel(value: unknown): AppointmentLabelValue | null {
  if (typeof value !== 'string') return null;
  const yoFree = value.trim().toLowerCase().replaceAll('ё', 'е');
  return APPOINTMENT_LABEL_BY_YO_FREE_FORM[yoFree] ?? null;
}

/** Значение приходит либо голым, либо стандартным `{ value }` envelope из БД. */
function unwrapSettingEnvelope(value: unknown): unknown {
  return value !== null && typeof value === 'object' && 'value' in value
    ? (value as { value?: unknown }).value
    : value;
}

/**
 * Резолвит формы слова о человеке и слова о событии записи из значений настроек организации.
 *
 * @param value — `patient_label`; не передано или не распознано → дефолт «пациент».
 * @param supportGroupValue — `support_group_label`; не распознано → «На сопровождении».
 * @param appointmentValue — `appointment_label`; не распознано → «приём» (сегодняшнее поведение).
 */
export function resolvePatientTerms(
  value?: unknown,
  supportGroupValue?: unknown,
  appointmentValue?: unknown,
): PatientTerms {
  const singular = unwrapSettingEnvelope(value);
  const normalized = normalizePatientLabel(singular);
  const appointment =
    APPOINTMENT_TERMS_BY_LABEL[
      normalizeAppointmentLabel(unwrapSettingEnvelope(appointmentValue)) ?? 'приём'
    ];
  const supportGroupLabel =
    normalizeSupportGroupLabel(supportGroupValue) === 'favorites'
      ? 'Избранные'
      : 'На сопровождении';
  if (normalized === 'клиент') {
    return {
      ...appointment,
      patientPluralLabel: 'Клиенты',
      patientGenPlural: 'клиентов',
      patientSingularLabel: 'Клиент',
      patientSingularLower: 'клиент',
      patientGenitive: 'клиента',
      patientDative: 'клиенту',
      patientDativePlural: 'клиентам',
      patientInstrumental: 'клиентом',
      patientInstrumentalPlural: 'клиентами',
      supportGroupLabel,
    };
  }
  return {
    ...appointment,
    patientPluralLabel: 'Пациенты',
    patientGenPlural: 'пациентов',
    patientSingularLabel: 'Пациент',
    patientSingularLower: 'пациент',
    patientGenitive: 'пациента',
    patientDative: 'пациенту',
    patientDativePlural: 'пациентам',
    patientInstrumental: 'пациентом',
    patientInstrumentalPlural: 'пациентами',
    supportGroupLabel,
  };
}

/**
 * Согласование прилагательного (или причастия) с родом слова о событии записи:
 * «Очный приём» → «Очная тренировка», «Приём сохранён» → «Тренировка сохранена».
 *
 * Падежи здесь не склеиваются — они приходят готовыми из `APPOINTMENT_TERMS_BY_LABEL`. Здесь
 * решается только выбор между двумя написанными формами определения по `appointmentGender`,
 * чтобы этот выбор не расползался ветвлением `=== 'feminine'` по компонентам.
 */
export function agreeWithAppointment(
  terms: Pick<AppointmentTerms, 'appointmentGender'>,
  masculine: string,
  feminine: string,
): string {
  return terms.appointmentGender === 'feminine' ? feminine : masculine;
}

/**
 * Формат проведения записи — одна пара надписей на весь продукт: календарь, панель записи,
 * индикаторы, запуск приёма из карточки. Раньше «Очный приём» / «Онлайн-приём» лежали
 * литералами в четырёх файлах, и род согласовать было негде.
 */
export function appointmentDeliveryFormatLabels(
  terms: Pick<AppointmentTerms, 'appointmentGender' | 'appointmentSingular'>,
): { in_person: string; online: string } {
  return {
    in_person: `${agreeWithAppointment(terms, 'Очный', 'Очная')} ${terms.appointmentSingular}`,
    online: `Онлайн-${terms.appointmentSingular}`,
  };
}

/** Слово с заглавной буквы в нужном падеже: «Тренировок пока нет», «Приёмов пока нет». */
export function capitalizeAppointmentForm(form: string): string {
  return form.charAt(0).toUpperCase() + form.slice(1);
}
