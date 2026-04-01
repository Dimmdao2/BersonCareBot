import { env } from "@/config/env";
import { createPgOnlineIntakePort } from "@/infra/repos/pgOnlineIntake";
import { createInMemoryOnlineIntake } from "@/infra/repos/inMemoryOnlineIntake";
import { createIntakeNotificationRelay } from "@/modules/online-intake/intakeNotificationRelay";
import { createOnlineIntakeService } from "@/modules/online-intake/service";
import type { OnlineIntakeService } from "@/modules/online-intake/ports";

let _service: OnlineIntakeService | null = null;

export function getOnlineIntakeService(): OnlineIntakeService {
  if (!_service) {
    const intakePort = env.DATABASE_URL ? createPgOnlineIntakePort() : createInMemoryOnlineIntake();
    _service = createOnlineIntakeService({
      intakePort,
      notificationPort: createIntakeNotificationRelay(),
    });
  }
  return _service;
}
