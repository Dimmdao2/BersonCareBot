import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import {
  applyDbOperationalOrganizationContextToConnection,
  type DbPrincipalApplyOptions,
  clearDbOperationalOrganizationContextFromConnection,
  resetDbOperationalRuntimeRole,
  setDbOperationalRuntimeRole,
} from '@bersoncare/db-principal';

export type ConfigReaderPoolProvider = {
  withOrganizationContext<T>(
    organizationId: string | undefined,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T>;
  end(): Promise<void>;
};

export function createConfigReaderPoolProvider(input: {
  connectionString: string;
  principalApplyOptions?: DbPrincipalApplyOptions;
  poolFactory?: (config: PoolConfig) => Pool;
}): ConfigReaderPoolProvider {
  const connectionString = input.connectionString.trim();
  if (!connectionString) throw new Error('Config-reader database connection string is not set');
  const poolFactory = input.poolFactory ?? ((config: PoolConfig) => new Pool(config));
  const rawPool = poolFactory({
    connectionString,
    max: 2,
    application_name: 'bcb_webapp_config_reader',
  });
  const principalApplyOptions = input.principalApplyOptions ?? {};

  return {
    async withOrganizationContext<T>(
      organizationId: string | undefined,
      operation: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
      const client = await rawPool.connect();
      let roleSelected = false;
      let operationError: unknown;
      try {
        await setDbOperationalRuntimeRole(client, 'app_config_reader');
        roleSelected = true;
        await applyDbOperationalOrganizationContextToConnection(
          client,
          organizationId,
          principalApplyOptions,
        );
        return await operation(client);
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        let cleanupError: unknown;
        try {
          if (roleSelected) {
            await clearDbOperationalOrganizationContextFromConnection(
              client,
              principalApplyOptions,
            );
          }
          await resetDbOperationalRuntimeRole(client);
        } catch (error) {
          cleanupError = error;
          if (operationError === undefined) throw error;
        } finally {
          const releaseError = operationError ?? cleanupError;
          client.release(
            releaseError === undefined
              ? undefined
              : releaseError instanceof Error
                ? releaseError
                : new Error('Config-reader checkout failed'),
          );
        }
      }
    },
    async end(): Promise<void> {
      await rawPool.end();
    },
  };
}
