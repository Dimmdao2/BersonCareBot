import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import {
	applyCurrentDbPrincipalToConnection,
	buildDbPrincipalApplyOptionsFromEnv,
	clearDbPrincipalFromConnection,
} from '@bersoncare/db-principal';
import {
	assertIntegratorLockedPrincipalClassified,
	getCurrentIntegratorTechnicalRuntimeRole,
	prepareIntegratorTechnicalPoolClient,
} from './withClient.js';

type IntegratorPoolProviderConfig = {
	connectionString: string;
	diagnosticConnectionString?: string;
	deliveryWorkerConnectionString?: string;
	schedulerConnectionString?: string;
	poolFactory?: (config: PoolConfig) => Pool;
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
			await prepareIntegratorTechnicalPoolClient(client, principalApplyOptions);
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
	const poolFactory = config.poolFactory ?? ((poolConfig: PoolConfig) => new Pool(poolConfig));
	const createPool = (connectionString: string, max: number): Pool => {
		const pool = poolFactory({ connectionString, max });
		pool.on('connect', prepareIntegratorPoolClient);
		installPrincipalAwarePoolQuery(pool);
		return pool;
	};
	const requestPool = createPool(config.connectionString, 5);
	const diagnosticConnectionString = config.diagnosticConnectionString?.trim();
	const deliveryWorkerConnectionString = config.deliveryWorkerConnectionString?.trim();
	const schedulerConnectionString = config.schedulerConnectionString?.trim();
	const diagnosticPool = diagnosticConnectionString ? createPool(diagnosticConnectionString, 2) : undefined;
	const deliveryWorkerPool = deliveryWorkerConnectionString ? createPool(deliveryWorkerConnectionString, 4) : undefined;
	const schedulerPool = schedulerConnectionString ? createPool(schedulerConnectionString, 2) : undefined;
	for (const operationalPool of [diagnosticPool, deliveryWorkerPool, schedulerPool]) {
		operationalPool?.on('error', (error, client) => requestPool.emit('error', error, client));
	}
	let routedPool: Pool;
	const selectPool = (): Pool => {
		const options = buildDbPrincipalApplyOptionsFromEnv(process.env);
		const role = options.mode === 'locked' ? getCurrentIntegratorTechnicalRuntimeRole() : undefined;
		if (role === 'app_operational_diagnostic') {
			if (!diagnosticPool) throw new Error('DATABASE_URL_DIAGNOSTIC is required for diagnostic DB access in locked mode');
			return diagnosticPool;
		}
		if (role === 'app_operational_delivery_worker') {
			if (!deliveryWorkerPool) throw new Error('DATABASE_URL_DELIVERY_WORKER is required for delivery worker DB access in locked mode');
			return deliveryWorkerPool;
		}
		if (role === 'app_operational_scheduler') {
			if (!schedulerPool) throw new Error('DATABASE_URL_SCHEDULER is required for scheduler DB access in locked mode');
			return schedulerPool;
		}
		return requestPool;
	};
	const routedConnect = (): Promise<PoolClient> => selectPool().connect();
	const routedQuery = (...args: Parameters<Pool['query']>): ReturnType<Pool['query']> => selectPool().query(...args);
	const routedEnd = async (): Promise<void> => {
		await Promise.all([requestPool.end(), diagnosticPool?.end(), deliveryWorkerPool?.end(), schedulerPool?.end()]);
	};
	routedPool = new Proxy(requestPool, {
		get(target, prop, receiver): unknown {
			if (prop === 'connect') return routedConnect;
			if (prop === 'query') return routedQuery;
			if (prop === 'end') return routedEnd;
			return Reflect.get(target, prop, receiver);
		},
	}) as Pool;
	return routedPool;
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
