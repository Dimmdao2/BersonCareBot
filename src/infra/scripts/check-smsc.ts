import { smscConfig } from '../../integrations/smsc/config.js';

type BalanceResponse = {
  balance?: string | number;
  error?: string;
  error_code?: number;
};

type CostResponse = {
  cost?: string | number;
  cnt?: number;
  error?: string;
  error_code?: number;
};

function parseArgs(argv: string[]): { phone?: string | undefined; message: string } {
  let phone: string | undefined;
  let message = 'SMSC dry run';

  for (const arg of argv) {
    if (arg.startsWith('--phone=')) phone = arg.slice('--phone='.length).trim() || undefined;
    if (arg.startsWith('--message=')) message = arg.slice('--message='.length).trim() || message;
  }

  return { phone, message };
}

function formatProviderError(payload: { error?: string; error_code?: number }): string {
  if (payload.error || typeof payload.error_code === 'number') {
    const code = typeof payload.error_code === 'number' ? ` (code: ${payload.error_code})` : '';
    return `${payload.error ?? 'SMSC_API_ERROR'}${code}`;
  }
  return 'Unknown SMSC error';
}

async function requestJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'GET' });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`SMSC_HTTP_${res.status}: ${raw.slice(0, 300)}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`SMSC_INVALID_JSON: ${raw.slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const { phone, message } = parseArgs(process.argv.slice(2));
  const common = new URLSearchParams({
    apikey: smscConfig.apiKey,
    fmt: '3',
    charset: 'utf-8',
  });

  const balanceUrl = `https://smsc.ru/sys/balance.php?${common.toString()}`;
  const balance = await requestJson<BalanceResponse>(balanceUrl);
  if (balance.error || typeof balance.error_code === 'number') {
    throw new Error(formatProviderError(balance));
  }

  console.log(`SMSC balance check ok. Balance: ${String(balance.balance ?? 'unknown')}`);

  if (!phone) {
    console.log('Dry-run cost check skipped: pass --phone=+79990001122 to validate send.php without sending.');
    return;
  }

  const costParams = new URLSearchParams({
    ...Object.fromEntries(common.entries()),
    phones: phone,
    mes: message,
    cost: '1',
  });
  const costUrl = `${smscConfig.baseUrl}?${costParams.toString()}`;
  const costResponse = await requestJson<CostResponse>(costUrl);
  if (costResponse.error || typeof costResponse.error_code === 'number') {
    throw new Error(formatProviderError(costResponse));
  }

  console.log(
    `SMSC send.php dry-run ok. Phone: ${phone}, estimated cost: ${String(costResponse.cost ?? 'unknown')}, sms parts: ${String(costResponse.cnt ?? 'unknown')}`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`SMSC check failed: ${message}`);
  process.exit(1);
});
