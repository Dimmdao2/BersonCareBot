import { Pool } from 'pg';
import type { PoolClient } from 'pg';

type IntegratorPoolProviderConfig = {
	connectionString: string;
};

function prepareIntegratorPoolClient(_client: PoolClient): void {
	// Dormant SAAS hook: future per-process DB principal setup belongs here.
}

export function createIntegratorPoolProvider(config: IntegratorPoolProviderConfig): Pool {
	const pool = new Pool({
		connectionString: config.connectionString,
	});
	pool.on('connect', prepareIntegratorPoolClient);
	return pool;
}
