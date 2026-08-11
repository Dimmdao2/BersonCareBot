import { sql } from 'drizzle-orm';
import { hashPortTypedArgs } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import {
  webappPortContextPrincipal,
  type PortCapabilityDescriptor,
} from '@/infra/db/portContextRuntime';
import {
  runWebappNamedRoot,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';

describe('runWebappNamedRoot', () => {
  it('installs descriptor purpose and canonical null-bearing args before Drizzle execute', async () => {
    const capabilities: Record<string, PortCapabilityDescriptor> = {
      password_acquire: {
        capabilityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        targetRole: 'app_runtime_pre_session',
        contextClass: 'pre_session',
        purpose: 'auth.password.begin',
        functionIdentity: 'app.password_login_acquire(text,text,uuid,text)',
      },
    };
    let selected: ReturnType<typeof webappPortContextPrincipal> | undefined;
    const execute = vi.fn(async () => {
      selected = webappPortContextPrincipal({ kind: 'bootstrap', source: 'password-login' }, capabilities);
      return { rows: [{ status: 'locked' }] };
    });
    const db = { execute } as unknown as WebappSqlExecutor;

    await runWebappNamedRoot(
      db,
      'app.password_login_acquire(text,text,uuid,text)',
      ['doctor@example.com', 'ip:hash', null, null],
      sql`SELECT app.password_login_acquire(${'doctor@example.com'}, ${'ip:hash'}, ${null}::uuid, ${null})`,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(selected?.principal).toMatchObject({
      purpose: 'auth.password.begin',
      functionIdentity: 'app.password_login_acquire(text,text,uuid,text)',
      typedArgs: [
        { typeTag: 'text@1', value: Buffer.from('doctor@example.com') },
        { typeTag: 'text@1', value: Buffer.from('ip:hash') },
        { typeTag: 'uuid@1', value: null },
        { typeTag: 'text@1', value: null },
      ],
    });
    expect(hashPortTypedArgs(selected?.principal.typedArgs ?? []).toString('hex')).toBe(
      'f1b47c4cfbc775bb4edf638e423b01d2f3265084f60614116fe73e6dbdf9b0ba',
    );
  });

  it('rejects an already-open relation transaction before executing the named root', async () => {
    const execute = vi.fn();
    const db = { execute, rollback: vi.fn() } as unknown as WebappSqlExecutor;

    await expect(
      runWebappNamedRoot(
        db,
        'app.password_login_read_altcha_secret()',
        [],
        sql`SELECT app.password_login_read_altcha_secret()`,
      ),
    ).rejects.toThrow('Webapp named root must start before the relation transaction');
    expect(execute).not.toHaveBeenCalled();
  });
});
