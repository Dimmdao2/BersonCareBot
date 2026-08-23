import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_OPERATOR } from '@/config/legalDocumentOperator';
import { LegalDocumentOperatorRequisites } from './LegalDocumentOperatorRequisites';

type MutableRequisites = {
  status: 'awaiting-owner-input';
  legalEntityName: string;
  registeredAddress: string;
  inn: string;
  ogrn: string;
};

const requisites = LEGAL_DOCUMENT_OPERATOR.requisites as unknown as MutableRequisites;
const originalRequisites = { ...requisites };

afterEach(() => {
  Object.assign(requisites, originalRequisites);
});

describe('LegalDocumentOperatorRequisites', () => {
  it('человек открывает документ без реквизитов оператора → видит, что наименование, адрес, ИНН и ОГРН ожидают владельца', () => {
    const html = renderToStaticMarkup(<LegalDocumentOperatorRequisites />);

    expect(html).toContain('Реквизиты оператора ожидают уточнения владельцем.');
    expect(html).toContain('Не указаны: Наименование юридического лица, Адрес, ИНН, ОГРН.');
  });

  it('в источник добавлены реквизиты оператора → они доходят до видимой legal-секции', () => {
    Object.assign(requisites, {
      legalEntityName: 'test-legal-entity-from-source',
      registeredAddress: 'test-address-from-source',
      inn: 'test-inn-from-source',
      ogrn: 'test-ogrn-from-source',
    });

    const html = renderToStaticMarkup(<LegalDocumentOperatorRequisites />);

    expect(html).toContain('test-legal-entity-from-source');
    expect(html).toContain('test-address-from-source');
    expect(html).toContain('test-inn-from-source');
    expect(html).toContain('test-ogrn-from-source');
  });
});
