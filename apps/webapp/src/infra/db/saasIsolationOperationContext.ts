import { AsyncLocalStorage } from 'node:async_hooks';

export type WebappDbOperationFamily =
  | 'public_auth_config'
  | 'auth_role_config'
  | 'patient_runtime_config'
  | 'public_booking_config'
  | 'patient_identity_exception_check'
  | 'patient_booking_catalog'
  | 'patient_booking_history'
  | 'patient_product_analytics'
  | 'patient_ui_config'
  | 'patient_calendar_timezone'
  | 'patient_content_catalog'
  | 'patient_diary';

const operationStore = new AsyncLocalStorage<WebappDbOperationFamily>();

export function runWithWebappDbOperationFamily<T>(
  family: WebappDbOperationFamily,
  fn: () => Promise<T>,
): Promise<T> {
  return operationStore.run(family, fn);
}

export function getCurrentWebappDbOperationFamily(): WebappDbOperationFamily | undefined {
  return operationStore.getStore();
}
