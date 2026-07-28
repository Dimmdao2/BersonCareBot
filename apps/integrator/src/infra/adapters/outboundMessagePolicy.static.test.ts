import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = new URL('../../', import.meta.url);

// These are the only source-backed provider/dispatch implementations allowed to
// import a provider client or invoke a provider send primitive directly. Every new
// integrator source file is scanned; adding a product path never requires editing a
// product-file list to keep this guard effective.
const DIRECT_PROVIDER_ALLOWLIST = new Set([
  'app/di.ts',
  'infra/adapters/dispatchPort.ts',
  'integrations/email/deliveryAdapter.ts',
  'integrations/email/mailer.ts',
  'integrations/max/deliveryAdapter.ts',
  'integrations/smsc/client.ts',
  'integrations/smsc/deliveryAdapter.ts',
  'integrations/telegram/client.ts',
  'integrations/telegram/deliveryAdapter.ts',
  'integrations/telegram/longPolling.ts',
  'integrations/telegram/mapOut.ts',
  'integrations/telegram/setupMenuButton.ts',
]);

const providerAdapterImport =
  /from\s+['"][^'"]*(?:integrations\/)?(?:telegram|max|email|smsc)\/deliveryAdapter(?:\.js)?['"]/;
const providerClientImport =
  /from\s+['"][^'"]*(?:integrations\/)?(?:telegram|max|email|smsc)\/(?:client|mailer)(?:\.js)?['"]/;
const providerSend = /(?:\.|\b)(?:sendMail|sendSms|sendMessage)\s*\(/;

async function sourceFiles(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory())
        return sourceFiles(new URL(`${entry.name}/`, directory), `${relative}/`);
      return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
        ? [relative]
        : [];
    }),
  );
  return nested.flat();
}

export function assertNoDirectProviderBypass(relativePath: string, source: string): void {
  if (DIRECT_PROVIDER_ALLOWLIST.has(relativePath)) return;
  if (
    providerAdapterImport.test(source) ||
    (providerClientImport.test(source) && providerSend.test(source))
  ) {
    throw new Error(`DIRECT_PROVIDER_BYPASS:${relativePath}`);
  }
}

describe('outbound egress source boundary', () => {
  it('scans every integrator source file outside the narrow provider/dispatch allowlist', async () => {
    const files = await sourceFiles(SRC_ROOT);
    await Promise.all(
      files.map(async (relativePath) => {
        const source = await readFile(new URL(relativePath, SRC_ROOT), 'utf8');
        expect(
          () => assertNoDirectProviderBypass(relativePath, source),
          relativePath,
        ).not.toThrow();
      }),
    );
  });

  it('would reject a newly added product source that bypasses DispatchPort', () => {
    expect(() =>
      assertNoDirectProviderBypass(
        'integrations/bersoncare/new-product-send.ts',
        "import { sendMail } from '../email/mailer.js';\nsendMail({});",
        // eslint-disable-next-line no-secrets/no-secrets -- closed static-checker error token, not a credential
      ),
    ).toThrow('DIRECT_PROVIDER_BYPASS:integrations/bersoncare/new-product-send.ts');
  });

  it('places the central policy before redirect, adapter lookup, and payload-bearing attempt logs', async () => {
    const source = await readFile(new URL('infra/adapters/dispatchPort.ts', SRC_ROOT), 'utf8');
    const policyIndex = source.indexOf('assertOutboundMessagePolicy(intent)');
    expect(policyIndex).toBeGreaterThan(-1);
    expect(policyIndex).toBeLessThan(source.indexOf('applyPreForkDevRedirect(intent)'));
    expect(policyIndex).toBeLessThan(source.indexOf('deps.adapters.find'));
    expect(policyIndex).toBeLessThan(source.indexOf('await logDeliveryAttempt', policyIndex));
  });
});
