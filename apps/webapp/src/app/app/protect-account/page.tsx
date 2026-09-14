import AccountProtectionClient from './AccountProtectionClient';

type Props = { searchParams?: Promise<{ key?: string | string[] }> };

export default async function AccountProtectionPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const key = typeof params.key === 'string' ? params.key : '';
  return <AccountProtectionClient actionKey={key} />;
}
