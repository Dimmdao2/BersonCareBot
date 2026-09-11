/**
 * Public clinic card `/{clinic}` — owner ruling 19.08: «надо сделать публичную страницу для клиник
 * уже (не записи а просто их визитку с описанием) и в кабинете админа клиники настройку что на ней
 * писать», plus «Логотип и фотографии на визитке — сейчас».
 *
 * Read model is the public projection and nothing else (plan §3.1): one row of
 * `clinic_public_directory_entries`, reached through a declared root because the bootstrap role
 * holds no privilege on that table at all. No tenant table is on the anonymous path.
 */

/**
 * Зачем у файла роль. Набор медиа карточки — ЕДИНСТВЕННОЕ, что авторизует анонимную отдачу файла
 * (`/{clinic}/media/{uuid}`), поэтому в нём лежит всё публичное этой клиники сразу: логотип,
 * фотографии, аватары опубликованных специалистов, файлы их полных описаний и файлы полного
 * описания самой клиники. Роль говорит, ГДЕ файл показывается; правом на отдачу является само
 * присутствие в наборе.
 */
export type ClinicPublicCardMediaRole =
  | 'logo'
  | 'photo'
  | 'specialistAvatar'
  | 'specialistDescription'
  | 'clinicDescription';

/** One ready file of the card. Delivery facts never reach the browser — only the id does. */
export type ClinicPublicCardMedia = {
  id: string;
  role: ClinicPublicCardMediaRole;
  mimeType: string;
  s3Key: string | null;
  storedPath: string | null;
};

/**
 * Опубликованный специалист клиники (#926 §17.G, решение владельца 11.09).
 *
 * Короткое описание — обычный текст, он же строка превью на визитке. Полное — markdown-материал,
 * который рисует только страница специалиста. Неопубликованный, неактивный и несуществующий
 * человек сюда не попадает одинаково, поэтому по форме ответа перебрать людей нельзя.
 */
export type ClinicPublicCardSpecialist = {
  id: string;
  fullName: string;
  shortDescription: string | null;
  fullDescriptionMarkdown: string | null;
  avatarMediaId: string | null;
};

export type ClinicPublicCardLocation = {
  title: string;
  cityCode: string | null;
  address: string | null;
};

/**
 * Услуга клиники на визитке (#926 §17.B): посетитель должен узнать, что клиника делает, не уходя в
 * мастер записи.
 *
 * Идентификатора здесь НЕТ намеренно (§3.2): на визитке по услуге нет действия, которому он был бы
 * нужен, а внутренние идентификаторы в публичную разметку не попадают. Что показывать, решает
 * клиника — тем же признаком публичности, которым она уже управляет записью: неактивная, снятая с
 * публичного виджета и «только для администратора» услуга наружу не выходит.
 */
export type ClinicPublicCardServiceItem = {
  title: string;
  description: string | null;
  durationMinutes: number;
  /** Копейки. Ноль — цена не заполнена; выдумывать «по запросу» за клинику нельзя. */
  priceMinor: number;
};

export type ClinicPublicCard = {
  requestedSlug: string;
  canonicalSlug: string;
  /** `redirect` when the visitor arrived through a retired slug that stays valid forever. */
  disposition: 'current' | 'redirect';
  /**
   * Выключила ли клиника показ своей страницы (#926 §17.F, решение владельца 11.09: «корень
   * клиники должен стать входом в кабинет… не должно быть исчезнувшего адреса»).
   *
   * Признак решает ровно одно: `/{clinic}` рисует визитку или вырожденный вход в кабинет. Он
   * НИЧЕГО не закрывает — уточнение владельца 11.09: «нам не надо сейчас пытаться что-то от кого-то
   * здесь закрыть». Набор медиа, специалисты, услуги и адреса приходят одинаково в обоих случаях,
   * поэтому фотографии, материалы и страницы специалистов этой клиники продолжают открываться.
   * И 404 здесь не бывает никогда: клиника с `is_published` каталога уже публична — по её адресу в
   * это же время работает запись.
   */
  cardIsPublished: boolean;
  displayName: string;
  /** Короткое описание — обычный текст, идёт строкой сверху. */
  description: string | null;
  /** Полное описание — markdown-материал; его медиа лежат в том же наборе `media`. */
  fullDescriptionMarkdown: string | null;
  publicContactPhone: string | null;
  publicContactEmail: string | null;
  publicWebsiteUrl: string | null;
  locations: ClinicPublicCardLocation[];
  specialists: ClinicPublicCardSpecialist[];
  services: ClinicPublicCardServiceItem[];
  media: ClinicPublicCardMedia[];
};

/** Clinic-admin editing state. Read directly under the staff principal (org-scoped by RLS). */
export type ClinicPublicCardSettings = {
  description: string | null;
  fullDescriptionMarkdown: string | null;
  publicContactPhone: string | null;
  publicContactEmail: string | null;
  publicWebsiteUrl: string | null;
  logoMediaId: string | null;
  photoMediaIds: string[];
  cardIsPublished: boolean;
};

export type SaveClinicPublicCardInput = ClinicPublicCardSettings & {
  organizationId: string;
};

/** Read-only часть визитки: её пишет не эта форма, а каталог и филиалы. */
/**
 * Кто эта клиника и по какому адресу открывается её визитка. Адресов филиалов здесь НЕТ намеренно:
 * их единственный источник — живые `be_branches`, и второго заводить нельзя (план §17.A).
 */
export type ClinicPublicCardIdentity = {
  slug: string;
  displayName: string;
};

export type ClinicPublicCardPort = {
  /**
   * Anonymous read. `null` means «no card here» for every reason at once — unknown slug,
   * unpublished directory entry, inactive organization, owner switched the page off. A failure to
   * READ (privilege denied, database down) THROWS instead, because a blank card in place of a
   * refusal is the silence this repository keeps clearing (plan §3.3).
   */
  readPublicCard(slug: string): Promise<ClinicPublicCard | null>;
  /** Clinic-admin read of its own card. */
  readCardSettings(organizationId: string): Promise<ClinicPublicCardSettings | null>;
  /**
   * Те части визитки, которые клиника НЕ правит в этой форме: её публичное имя, адрес страницы и
   * адреса филиалов. Нужны предпросмотру в кабинете — без них он показывал бы не страницу, а одни
   * поля формы. Отдельным чтением, а не расширением `readCardSettings`, чтобы форма сохранения не
   * получила полей, которые она не сохраняет.
   */
  readCardIdentity(organizationId: string): Promise<ClinicPublicCardIdentity | null>;
  /** Clinic-admin write through the declared root; the staff role cannot write these columns. */
  saveCard(input: SaveClinicPublicCardInput): Promise<ClinicPublicCardSettings>;
};

export const CLINIC_PUBLIC_CARD_LIMITS = {
  descriptionMaxLength: 4000,
  /** Тот же потолок, что у полного описания специалиста, — одно правило на оба материала. */
  fullDescriptionMaxLength: 50_000,
  phoneMaxLength: 64,
  emailMaxLength: 320,
  websiteMaxLength: 512,
  maxPhotos: 12,
} as const;
