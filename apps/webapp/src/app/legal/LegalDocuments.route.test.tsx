import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_OPERATOR } from '@/config/legalDocumentOperator';
import PrivacyPolicyPage from './privacy/page';
import TermsOfServicePage from './terms/page';

type MutableRequisites = {
  status: 'awaiting-owner-input';
  legalEntityName: string;
  registeredAddress: string;
  inn: string;
  ogrn: string;
};

const requisites = LEGAL_DOCUMENT_OPERATOR.requisites as unknown as MutableRequisites;
const originalRequisites = { ...requisites };

const LEGAL_PAGES = [
  { path: '/legal/terms', renderPage: TermsOfServicePage },
  { path: '/legal/privacy', renderPage: PrivacyPolicyPage },
] as const;

afterEach(() => {
  Object.assign(requisites, originalRequisites);
});

describe.each(LEGAL_PAGES)('$path', ({ renderPage }) => {
  it('источник пуст → страница честно сообщает, какие реквизиты ожидают владельца', () => {
    const html = renderToStaticMarkup(renderPage());

    expect(html).toContain('Реквизиты оператора ожидают уточнения владельцем.');
    expect(html).toContain('Не указаны: Наименование юридического лица, Адрес, ИНН, ОГРН.');
  });

  it('источник заполнен → все значения источника видны на странице', () => {
    const sourceMarkers = {
      legalEntityName: '__from_source_legal_entity_name__',
      registeredAddress: '__from_source_registered_address__',
      inn: '__from_source_inn__',
      ogrn: '__from_source_ogrn__',
    };
    Object.assign(requisites, sourceMarkers);

    const html = renderToStaticMarkup(renderPage());

    for (const marker of Object.values(sourceMarkers)) {
      expect(html).toContain(marker);
    }
  });
});
