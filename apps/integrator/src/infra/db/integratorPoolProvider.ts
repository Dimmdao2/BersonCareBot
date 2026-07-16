import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import {
	applyCurrentDbPrincipalToConnection,
	buildDbPrincipalApplyOptionsFromEnv,
	clearDbPrincipalFromConnection,
} from '@bersoncare/db-principal';
import { assertIntegratorLockedPrincipalClassified } from './withClient.js';

type IntegratorPoolProviderConfig = {
	connectionString: string;
};

function prepareIntegratorPoolClient(_client: PoolClient): void {
	// Dormant SAAS hook: future per-process DB principal setup belongs here.
}

function releasePoolClient(client: PoolClient, cleanupError?: unknown): void {
	if (cleanupError === undefined) {
		client.release();
		return;
	}

	client.release(cleanupError instanceof Error ? cleanupError : new Error('DB principal cleanup failed'));
}

function toTelemetryReleaseError(failure: unknown): Error {
	return failure instanceof Error ? failure : new Error(String(failure));
}

function installPrincipalAwarePoolQuery(pool: Pool): void {
	const queryWithPrincipal = async (
		...args: Parameters<Pool['query']>
	): Promise<Awaited<ReturnType<Pool['query']>>> => {
		const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
		assertIntegratorLockedPrincipalClassified(principalApplyOptions);
		const client = await pool.connect();
		let queryError: unknown;
		let result: Awaited<ReturnType<Pool['query']>> | undefined;
		try {
			await applyCurrentDbPrincipalToConnection(client, principalApplyOptions);
			const query = client.query.bind(client) as unknown as (...innerArgs: Parameters<Pool['query']>) => ReturnType<Pool['query']>;
			result = await query(...args);
		} catch (err) {
			queryError = err;
		}

		let cleanupError: unknown;
		try {
			await clearDbPrincipalFromConnection(client, principalApplyOptions);
		} catch (err) {
			cleanupError = err;
		}
		releasePoolClient(client, cleanupError);
		if (queryError !== undefined) {
			throw queryError;
		}
		if (cleanupError !== undefined) {
			throw cleanupError;
		}
		return result as Awaited<ReturnType<Pool['query']>>;
	};

	pool.query = ((...args: Parameters<Pool['query']>) => {
		if (typeof args.at(-1) === 'function') {
			throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
		}
		return queryWithPrincipal(...args);
	}) as unknown as Pool['query'];
}

export function createIntegratorPoolProvider(config: IntegratorPoolProviderConfig): Pool {
	const pool = new Pool({
		connectionString: config.connectionString,
	});
	pool.on('connect', prepareIntegratorPoolClient);
	installPrincipalAwarePoolQuery(pool);
	return pool;
}

/** Dedicated true-global telemetry transport; intentionally bypasses request-principal installation. */
export function createIntegratorSaasIsolationTelemetryPoolProvider(connectionString: string): Pool {
	return new Pool({
		connectionString,
		max: 1,
		application_name: 'bcb_integrator_saas_telemetry',
		connectionTimeoutMillis: 250,
		query_timeout: 200,
		statement_timeout: 200,
	});
}

/** Runs one telemetry operation on a dedicated checked-out client without request-principal installation. */
export async function withIntegratorSaasIsolationTelemetryClient<T>(
	pool: Pick<Pool, 'connect'>,
	fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	let failure: unknown;
	try {
		return await fn(client);
	} catch (error) {
		failure = error;
		throw error;
	} finally {
		client.release(failure === undefined ? undefined : toTelemetryReleaseError(failure));
	}
}
