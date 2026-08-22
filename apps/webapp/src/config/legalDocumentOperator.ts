import type { Metadata } from 'next';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';
import { PLATFORM_NAME } from './productSurfaces';

/**
 * Единственное место для реквизитов владельца юридических документов.
 *
 * Владелец заполнит значения отдельным проходом. Пока они намеренно пусты:
 * подставлять на их место имя бренда, адрес или ИНН нельзя.
 */
export const LEGAL_DOCUMENT_OPERATOR = {
  productName: PLATFORM_NAME,
  requisites: {
    status: 'awaiting-owner-input',
    legalEntityName: '',
    registeredAddress: '',
    inn: '',
    ogrn: '',
  },
} as const;

/**
 * Legal-документы принадлежат компании, а не поверхности, с которой на них пришли.
 * Все PWA-поля задаются вместе, чтобы title, apple title и manifest не представляли
 * одну страницу разными продуктами.
 */
export const legalDocumentMetadata: Metadata = {
  ...staffPwaLayoutMetadata,
  title: LEGAL_DOCUMENT_OPERATOR.productName,
  appleWebApp: {
    capable: true,
    title: LEGAL_DOCUMENT_OPERATOR.productName,
    statusBarStyle: 'default',
  },
};
