import { allTimezones } from "react-timezone-select";

/**
 * Подписи для `react-timezone-select` (`timezones`): IANA → текст **без** префикса UTC (его добавляет компонент).
 * РФ — русские города по 2–3 на строку.
 * Не-РФ — по 2–3 города на строку.
 *
 * Важно: библиотека **склеивает** зоны с одинаковым `(offset, hasDst)` и оставляет **первую**
 * в отсортированном списке; `Europe/Bucharest` обычно «съедает» `Europe/Athens` / `Europe/Helsinki`.
 * Поэтому Киев и «хельсинки» держим в подписи **Europe/Bucharest** (первая строка в группе).
 * Аналогично **+4**: в дефолте раньше идёт `Asia/Dubai`, чем `Asia/Baku` — строка «Baku…Yerevan» режется;
 * Ереван/Баку держим в подписи **Asia/Dubai**.
 * **+5 (зима/лето)**: обычно первым идёт `Asia/Yekaterinburg` — подписи `Asia/Karachi` / `Asia/Almaty` могут не попасть в UI,
 * но остаются в `searchTerms` у выжившей строки (поиск по «Tashkent» и т.д.).
 */
const LABEL_OVERRIDES: Record<string, string> = {
  "Europe/Moscow": "Москва, Санкт-Петербург, Казань",
  /** Часто единственная видимая «европейская» +3 строка рядом с РФ — сюда Киев + Хельсинки. */
  "Europe/Bucharest": "Kyiv, Bucharest, Helsinki",
  "Europe/Helsinki": "Riga, Tallinn, Vilnius",
  "Europe/Athens": "Athens, Nicosia",
  "Europe/Belgrade": "Belgrade, Podgorica, Novi Sad",
  /** Сохраняем для поиска (строка может быть скрыта дедупом с `Asia/Dubai`). */
  "Asia/Baku": "Baku, Tbilisi, Yerevan",
  "Asia/Almaty": "Almaty, Tashkent, Bishkek",
  "Asia/Karachi": "Islamabad, Karachi",
  "Asia/Kabul": "Kabul",
  "Asia/Kathmandu": "Kathmandu",
  "Asia/Kolkata": "Delhi, Mumbai, Kolkata",
  "Asia/Dhaka": "Dhaka, Thimphu",
  /** Первая видимая +4 в дефолтном порядке — сюда Кавказ (иначе `Asia/Baku` режется). */
  "Asia/Dubai": "Dubai, Baku, Yerevan",
  "Asia/Bangkok": "Bangkok, Hanoi, Jakarta",
  "Asia/Yekaterinburg": "Екатеринбург, Челябинск, Уфа",
  "Asia/Krasnoyarsk": "Красноярск, Кемерово, Новокузнецк",
  "Asia/Irkutsk": "Иркутск, Улан-Удэ, Братск",
  "Asia/Yakutsk": "Якутск, Благовещенск, Чита",
  "Asia/Vladivostok": "Владивосток, Хабаровск, Южно-Сахалинск",
  "Asia/Magadan": "Магадан",
  "Asia/Kamchatka": "Петропавловск-Камчатский, Анадырь",
  "Australia/Darwin": "Darwin",
  "Australia/Adelaide": "Adelaide",
  "Australia/Sydney": "Sydney, Melbourne, Canberra",
};

const EXTRA_RELOCATION_IANA_LABELS: Record<string, string> = {
  "Europe/Samara": "Самара, Саратов, Ульяновск",
  "Asia/Omsk": "Омск",
  "Asia/Novosibirsk": "Новосибирск, Томск, Барнаул",
  "Europe/Istanbul": "Istanbul, Minsk",
};

export function mergePatientTimezoneSelectLabels(extraIana: string | null): Record<string, string> {
  const map: Record<string, string> = {
    ...allTimezones,
    ...LABEL_OVERRIDES,
    ...EXTRA_RELOCATION_IANA_LABELS,
  };
  const ex = extraIana?.trim();
  if (ex && map[ex] === undefined) {
    map[ex] = ex;
  }
  return map;
}
