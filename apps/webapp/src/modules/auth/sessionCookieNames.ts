export const SESSION_COOKIE_NAME = 'bersoncare_webapp_session';
/** Короткоживущий маркер «свежий вход» (дублирует sessionStorage на server redirect). */
export const FRESH_LOGIN_COOKIE_NAME = 'bersoncare_fresh_login';
/**
 * Долгоживущая метка устройства (#1112, вариант B). НЕ участвует в аутентификации: её единственная
 * работа — сказать, что вчерашний вход и сегодняшний сделаны с одного и того же устройства, даже
 * если адрес сменился (мобильный интернет, домашний роутер, VPN). Поэтому она ничего не решает и
 * ничего не открывает: подделав её, злоумышленник получит только неверную подпись в журнале.
 */
export const DEVICE_MARKER_COOKIE_NAME = 'bersoncare_device';
