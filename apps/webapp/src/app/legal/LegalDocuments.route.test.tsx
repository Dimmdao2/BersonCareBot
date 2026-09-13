import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_OPERATOR } from '@/config/legalDocumentOperator';
import PrivacyPolicyPage from './privacy/page';
import TermsOfServicePage from './terms/page';

type MutableRequisites = {
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

/**
 * Страницу ищем по её роли, а не по формулировке: плашка «ожидают уточнения» помечена
 * `role="status"`, и проверяется, появляется ли она и какие реквизиты в ней названы. Переписать
 * текст плашки можно без починки этих проверок; потерять её или назвать не те реквизиты — нельзя.
 */
function awaitingOwnerNotice(html: string): string | null {
  return /<p[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/u.exec(html)?.[1] ?? null;
}

const REQUISITE_LABELS = ['Наименование юридического лица', 'Адрес', 'ИНН', 'ОГРН'] as const;

describe.each(LEGAL_PAGES)('$path', ({ renderPage }) => {
  it('источник пуст → страница честно сообщает, какие реквизиты ожидают владельца', () => {
    const notice = awaitingOwnerNotice(renderToStaticMarkup(renderPage()));

    expect(notice).not.toBeNull();
    for (const label of REQUISITE_LABELS) expect(notice).toContain(label);
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
    expect(awaitingOwnerNotice(html)).toBeNull();
  });

  it('источник заполнен частично → страница перечисляет только недостающие реквизиты', () => {
    Object.assign(requisites, {
      legalEntityName: '__from_source_legal_entity_name__',
      registeredAddress: '',
      inn: '',
      ogrn: '',
    });

    const notice = awaitingOwnerNotice(renderToStaticMarkup(renderPage()));

    expect(notice).not.toBeNull();
    expect(notice).toContain('Адрес');
    expect(notice).toContain('ИНН');
    expect(notice).toContain('ОГРН');
    expect(notice).not.toContain('Наименование юридического лица');
  });
});
