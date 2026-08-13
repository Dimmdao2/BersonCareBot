import type { Privilege } from './types.ts';

export interface Revision10DirectGrant {
  role: string;
  operations: Privilege[];
  columns: 'table' | string[];
}

export type Revision10ClinicalAccess =
  | { kind: 'direct'; purpose: string; codePaths: string[]; grants: Revision10DirectGrant[] }
  | { kind: 'no-runtime-surface'; purpose: string; evidence: string[] };

/**
 * Explicit clinical relation access inventory.  Each row is relation-specific:
 * data class never implies a role or an operation.  Production callsites prove
 * necessity; the hand-narrowed exceptions remain narrower than the lexical
 * operation upper bound.
 */
export const REV10_CLINICAL_ACCESS: Record<string, Revision10ClinicalAccess> = {
  "integrator.user_reminder_delivery_logs": {
    "kind": "direct",
    "purpose": "журнал доставки напоминаний — не видно, почему напоминание не дошло",
    "codePaths": [
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/integrator/src/infra/db/schema/integratorDomainRepos.ts",
      "apps/integrator/src/kernel/contracts/ports.ts"
    ],
    "grants": [
      {
        "role": "app_integrator_request",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "channel",
          "created_at",
          "occurrence_id",
          "payload_json",
          "status"
        ]
      },
      {
        "role": "app_integrator_request",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel",
          "created_at",
          "error_code",
          "id",
          "occurrence_id",
          "organization_id",
          "payload_json",
          "status"
        ]
      }
    ]
  },
  "integrator.user_reminder_occurrences": {
    "kind": "direct",
    "purpose": "конкретные срабатывания напоминаний — напоминания не ставятся в очередь и дублируются",
    "codePaths": [
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/integrator/src/infra/db/schema/integratorDomainRepos.ts",
      "apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts",
      "apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts"
    ],
    "grants": [
      {
        "role": "app_integrator_request",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "delivery_channel",
          "error_code",
          "failed_at",
          "id",
          "organization_id",
          "planned_at",
          "rule_id",
          "sent_at",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_integrator_request",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "delivery_channel",
          "delivery_job_id",
          "error_code",
          "failed_at",
          "planned_at",
          "queued_at",
          "sent_at",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_integrator_request",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      }
    ]
  },
  "public.be_appointment_cancellations": {
    "kind": "direct",
    "purpose": "отмены визитов — ломается политика отмен и возвратов предоплаты",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "actor_type",
          "applied_policy_id",
          "applied_policy_snapshot",
          "appointment_id",
          "cancellation_type",
          "created_at",
          "manual_override",
          "notifications_sent",
          "organization_id",
          "package_session_charged",
          "prepayment_refunded",
          "prepayment_retained",
          "reason",
          "staff_comment",
          "was_free",
          "was_penalized"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "notifications_sent"
        ]
      }
    ]
  },
  "public.be_appointment_history_events": {
    "kind": "direct",
    "purpose": "человекочитаемая история записи — врач перестаёт видеть «кто и когда менял запись»",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "appointment_id",
          "event_type",
          "occurred_at",
          "organization_id",
          "payload"
        ]
      }
    ]
  },
  "public.be_appointment_no_shows": {
    "kind": "direct",
    "purpose": "неявки — не считается счётчик неявок пациента",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "actor_type",
          "appointment_id",
          "created_at",
          "manual_override",
          "notifications_sent",
          "organization_id",
          "reason",
          "staff_comment"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "notifications_sent"
        ]
      }
    ]
  },
  "public.be_appointment_reschedules": {
    "kind": "direct",
    "purpose": "переносы — ломается бесплатный/платный перенос и лимит переносов",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "actor_type",
          "applied_policy_id",
          "applied_policy_snapshot",
          "appointment_id",
          "created_at",
          "free_cancellation_available_after",
          "free_cancellation_available_at_reschedule",
          "from_end_at",
          "from_start_at",
          "manual_override",
          "notifications_sent",
          "organization_id",
          "reason",
          "staff_comment",
          "to_end_at",
          "to_start_at",
          "was_in_free_reschedule_window"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "notifications_sent"
        ]
      }
    ]
  },
  "public.be_appointment_staff_comments": {
    "kind": "direct",
    "purpose": "внутренние комментарии персонала о пациенте — врач теряет заметки по визиту",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/calendarDescription.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "organization_id",
          "appointment_id",
          "platform_user_id",
          "author_id",
          "body",
          "created_at",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "appointment_id",
          "author_id",
          "body",
          "created_at",
          "organization_id",
          "platform_user_id",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_appointments": {
    "kind": "direct",
    "purpose": "записи на приём — без них нет ни расписания врача, ни визита пациента",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/resolvePackageCalendarContext.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app/api/admin/booking-engine/public-appointments/route.ts",
      "apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.tsx",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/doctorAppointmentPurgeFilter.ts",
      "apps/webapp/src/infra/repos/pgCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgAppointmentReminderMaterialization.ts",
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
      "apps/webapp/src/infra/repos/pgPayments.ts",
      "apps/webapp/src/modules/booking-attribution/types.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/memberships/service.ts",
      "apps/webapp/src/modules/memberships/types.ts",
      "apps/webapp/src/modules/patient-booking/canonicalCreate.ts",
      "apps/webapp/src/modules/patient-booking/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "appointment_reminder_allowed_preset_ids",
          "appointment_reminder_preset_id",
          "appointment_reminder_selection_source",
          "attribution_json",
          "branch_id",
          "chain_id",
          "chain_position",
          "created_at",
          "duration_minutes",
          "end_at",
          "id",
          "organization_id",
          "original_start_at",
          "phone_normalized",
          "platform_user_id",
          "reschedule_count",
          "room_id",
          "service_id",
          "source",
          "specialist_id",
          "start_at",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "appointment_reminder_preset_id",
          "appointment_reminder_selection_source",
          "branch_id",
          "deleted_at",
          "duration_minutes",
          "end_at",
          "original_start_at",
          "package_usage_ref",
          "payment_ref",
          "reschedule_count",
          "room_id",
          "service_id",
          "specialist_id",
          "start_at",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "package_usage_ref"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_availability_rules": {
    "kind": "direct",
    "purpose": "правила доступности специалиста — не считаются свободные слоты",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "config",
          "is_active",
          "organization_id",
          "rule_type",
          "specialist_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "config",
          "is_active",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_booking_form_fields": {
    "kind": "direct",
    "purpose": "конструктор полей формы записи — форма записи теряет настраиваемые поля",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingForm.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "field_key",
          "field_type",
          "is_active",
          "is_required",
          "label",
          "organization_id",
          "placeholder",
          "sort_order",
          "updated_at",
          "visible_to_patient",
          "visible_to_staff"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "field_key",
          "field_type",
          "is_active",
          "is_required",
          "label",
          "placeholder",
          "sort_order",
          "updated_at",
          "visible_to_patient",
          "visible_to_staff"
        ]
      }
    ]
  },
  "public.be_booking_form_submissions": {
    "kind": "direct",
    "purpose": "ответы пациента в форме записи — теряются данные, введённые пациентом при записи",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingForm.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "appointment_id",
          "field_id",
          "organization_id",
          "value_text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "value_text"
        ]
      }
    ]
  },
  "public.be_branches": {
    "kind": "direct",
    "purpose": "филиалы клиники — расписание некуда привязать, ломаются часовые пояса",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts",
      "apps/webapp/src/infra/repos/pgOrgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts",
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/modules/patient-booking/projectCanonicalAppointment.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "address",
          "city_code",
          "color",
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "short_title",
          "sort_order",
          "timezone",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "address",
          "city_code",
          "color",
          "is_active",
          "short_title",
          "sort_order",
          "timezone",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_cancellation_policies": {
    "kind": "direct",
    "purpose": "политика отмен — отмены перестают штрафоваться по правилам клиники",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingPolicies.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "cancellation_allowed",
          "charge_package_session_on_late",
          "created_at",
          "free_cancel_hours_before",
          "is_active",
          "late_cancellation_behavior",
          "notify_patient",
          "notify_staff",
          "organization_id",
          "refund_prepayment_on_late",
          "requires_staff_confirmation",
          "scope_entity_id",
          "scope_level",
          "sort_order",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "cancellation_allowed",
          "charge_package_session_on_late",
          "free_cancel_hours_before",
          "is_active",
          "late_cancellation_behavior",
          "notify_patient",
          "notify_staff",
          "refund_prepayment_on_late",
          "requires_staff_confirmation",
          "scope_entity_id",
          "scope_level",
          "sort_order",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_clinic_services": {
    "kind": "direct",
    "purpose": "услуги клиники — не на что записываться и нечего считать в прайсе",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "admin_manual_only",
          "buffer_after_minutes",
          "created_at",
          "description",
          "duration_minutes",
          "id",
          "is_active",
          "online_payment_applicable",
          "organization_id",
          "prepayment_applicable",
          "price_minor",
          "public_widget_visible",
          "sort_order",
          "title",
          "updated_at",
          "usable_in_packages"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "admin_manual_only",
          "buffer_after_minutes",
          "description",
          "duration_minutes",
          "is_active",
          "online_payment_applicable",
          "organization_id",
          "prepayment_applicable",
          "price_minor",
          "public_widget_visible",
          "sort_order",
          "title",
          "updated_at",
          "usable_in_packages"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.be_external_entity_mappings": {
    "kind": "direct",
    "purpose": "сопоставление «наш id ↔ id внешней системы» — рвётся связь с Rubitime/внешними системами, начинаются дубли",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingEngine.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.be_organization_members": {
    "kind": "direct",
    "purpose": "членство человека в клинике — никто не определяется как врач/админ клиники — падает вся авторизация кабинета",
    "codePaths": [
      "apps/integrator/src/infra/db/migrate.ts",
      "apps/integrator/src/infra/db/repos/channelUsers.ts",
      "apps/integrator/src/infra/db/repos/integratorUserOrganizationSql.ts",
      "apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts",
      "apps/integrator/src/infra/db/repos/messageThreads.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/webapp/src/app/app/account/accountContext.ts",
      "apps/webapp/src/infra/repos/pgDevBypassClinicAdminWorkspace.ts",
      "apps/webapp/src/infra/repos/pgOperatorHealthRead.ts",
      "apps/webapp/src/infra/repos/pgOrganizationInvites.ts",
      "apps/webapp/src/infra/repos/pgOrganizationMembership.ts",
      "apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts",
      "apps/webapp/src/infra/repos/pgStaffUsers.ts",
      "apps/webapp/src/infra/repos/seatUsageSql.ts",
      "apps/webapp/src/infra/repos/transactionQuotaPort.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "organization_id",
          "platform_user_id",
          "role",
          "specialist_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "doctor_screens_disabled",
          "role",
          "specialist_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "organization_id",
          "platform_user_id",
          "status"
        ]
      }
    ]
  },
  "public.be_organizations": {
    "kind": "direct",
    "purpose": "сама клиника — без неё нет арендатора вообще",
    "codePaths": [
      "apps/integrator/src/infra/db/realPostgresIntegrationTestHarness.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgClinicDirectory.ts",
      "apps/webapp/src/infra/repos/pgDevBypassClinicAdminWorkspace.ts",
      "apps/webapp/src/infra/repos/pgOperatorHealthRead.ts",
      "apps/webapp/src/infra/repos/pgOrgBranding.ts",
      "apps/webapp/src/infra/repos/pgOrgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgOrganizationInvites.ts",
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts",
      "apps/webapp/src/infra/repos/transactionQuotaPort.ts",
      "apps/webapp/src/modules/clinic-directory/ports.ts",
      "apps/webapp/src/modules/org-branding/ports.ts",
      "apps/webapp/src/modules/org-entitlements/ports.ts",
      "apps/webapp/src/modules/saas-billing/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "id",
          "is_active",
          "sort_order",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active",
          "sort_order",
          "tariff_id",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "is_active"
        ]
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "tariff_id"
        ]
      }
    ]
  },
  "public.be_package_history_events": {
    "kind": "direct",
    "purpose": "история абонемента пациента — не видно, кто продлил/заморозил абонемент",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "event_type",
          "occurred_at",
          "organization_id",
          "patient_package_id",
          "payload_json"
        ]
      }
    ]
  },
  "public.be_package_items": {
    "kind": "direct",
    "purpose": "состав абонемента-шаблона — нельзя описать, что входит в абонемент",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgMemberships.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "package_id",
          "quantity",
          "service_id",
          "sort_order"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.be_package_usages": {
    "kind": "direct",
    "purpose": "списания сеансов абонемента — сеансы не списываются с абонемента",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/resolvePackageCalendarContext.ts",
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/modules/memberships/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "appointment_id",
          "comment",
          "created_at",
          "created_by_platform_user_id",
          "occurred_at",
          "organization_id",
          "patient_package_id",
          "patient_package_item_id",
          "quantity",
          "usage_kind"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "patient_package_id",
          "usage_kind",
          "occurred_at"
        ]
      }
    ]
  },
  "public.be_patient_booking_profiles": {
    "kind": "direct",
    "purpose": "профиль пациента у клиники — нельзя заблокировать самозапись проблемному пациенту",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/calendarDescription.ts",
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "is_problematic",
          "booking_blocked",
          "problematic_note",
          "no_show_count",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "booking_blocked",
          "is_problematic",
          "no_show_count",
          "organization_id",
          "platform_user_id",
          "problematic_note",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "booking_blocked",
          "is_problematic",
          "no_show_count",
          "problematic_note",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "booking_blocked",
          "is_problematic",
          "organization_id",
          "platform_user_id",
          "problematic_note",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "booking_blocked",
          "is_problematic",
          "problematic_note",
          "updated_at",
          "updated_by"
        ]
      }
    ]
  },
  "public.be_patient_package_items": {
    "kind": "direct",
    "purpose": "состав купленного абонемента — не известно, сколько сеансов какой услуги куплено",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/resolvePackageCalendarContext.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "patient_package_id",
          "quantity_initial",
          "service_id",
          "sort_order"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "patient_package_id",
          "quantity_initial",
          "sort_order"
        ]
      }
    ]
  },
  "public.be_patient_packages": {
    "kind": "direct",
    "purpose": "купленные пациентом абонементы — абонементы перестают списываться и показываться",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/resolvePackageCalendarContext.ts",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabRecords.tsx",
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgMemberships.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "assigned_by_platform_user_id",
          "created_at",
          "currency",
          "deduction_mode",
          "notes",
          "organization_id",
          "paid_amount_minor",
          "paid_currency",
          "platform_user_id",
          "price_minor",
          "sold_at",
          "status",
          "subscription_package_id",
          "title",
          "updated_at",
          "valid_from",
          "valid_until",
          "validity_days"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "notes",
          "paid_amount_minor",
          "paid_currency",
          "payment_intent_id",
          "payment_ref",
          "sold_at",
          "status",
          "updated_at",
          "valid_from",
          "valid_until"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "sold_at",
          "created_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_patient_timeline_events": {
    "kind": "direct",
    "purpose": "лента событий пациента — пропадает единая хронология по клиенту",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "domain",
          "event_type",
          "linked_object_id",
          "linked_object_type",
          "occurred_at",
          "organization_id",
          "payload",
          "platform_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_payment_history_events": {
    "kind": "direct",
    "purpose": "история платежей пациента — пропадает платёжная хронология в карточке пациента",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/patients/[userId]/payment-timeline/route.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgPayments.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "appointment_id",
          "comment",
          "currency",
          "event_type",
          "organization_id",
          "payload_json",
          "payment_id",
          "platform_user_id",
          "provider_id",
          "purpose",
          "refund_id",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_payment_intents": {
    "kind": "direct",
    "purpose": "намерения оплаты — не создаётся ссылка на оплату/предоплату",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgPayments.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "appointment_id",
          "checkout_url",
          "created_at",
          "currency",
          "idempotency_key",
          "metadata_json",
          "organization_id",
          "platform_user_id",
          "product_ref",
          "provider_id",
          "provider_intent_ref",
          "purpose",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_payment_provider_events": {
    "kind": "direct",
    "purpose": "сырые вебхуки платёжного провайдера — платёж не подтверждается автоматически",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPayments.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "event_type",
          "idempotency_key",
          "intent_ref",
          "organization_id",
          "payload_json",
          "provider_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "processed_at"
        ]
      }
    ]
  },
  "public.be_payments": {
    "kind": "direct",
    "purpose": "платежи пациента — нет учёта оплат визитов",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPayments.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "appointment_id",
          "captured_at",
          "created_at",
          "currency",
          "organization_id",
          "payment_intent_id",
          "platform_user_id",
          "provider_id",
          "purpose",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.be_prepayment_policies": {
    "kind": "direct",
    "purpose": "политика предоплаты по услуге — не берётся предоплата",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPayments.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "created_at",
          "currency",
          "is_active",
          "mode",
          "online_category",
          "organization_id",
          "percent_bps",
          "service_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "amount_minor",
          "currency",
          "is_active",
          "mode",
          "percent_bps",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_refunds": {
    "kind": "direct",
    "purpose": "возвраты — нельзя вернуть предоплату",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPayments.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "appointment_id",
          "currency",
          "organization_id",
          "payment_id",
          "provider_refund_ref",
          "reason",
          "status"
        ]
      }
    ]
  },
  "public.be_reschedule_policies": {
    "kind": "direct",
    "purpose": "политика переносов — пациент переносит визит без ограничений",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingPolicies.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "allow_different_branch",
          "allow_different_city",
          "allow_different_service",
          "allow_different_specialist",
          "created_at",
          "is_active",
          "limit_exceeded_behavior",
          "max_self_reschedules",
          "notify_patient",
          "notify_staff",
          "organization_id",
          "requires_staff_confirmation",
          "scope_entity_id",
          "scope_level",
          "self_reschedule_hours_before",
          "sort_order",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "allow_different_branch",
          "allow_different_city",
          "allow_different_service",
          "allow_different_specialist",
          "is_active",
          "limit_exceeded_behavior",
          "max_self_reschedules",
          "notify_patient",
          "notify_staff",
          "requires_staff_confirmation",
          "scope_entity_id",
          "scope_level",
          "self_reschedule_hours_before",
          "sort_order",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_rooms": {
    "kind": "direct",
    "purpose": "кабинеты филиала — нельзя развести приёмы по кабинетам",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "sort_order",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active",
          "sort_order",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_schedule_blocks": {
    "kind": "direct",
    "purpose": "блокировки времени (отпуск, перерыв) — врача записывают в занятое/нерабочее время",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "block_type",
          "branch_id",
          "created_by_actor_id",
          "end_at",
          "organization_id",
          "room_id",
          "specialist_id",
          "start_at",
          "title"
        ]
      }
    ]
  },
  "public.be_schedule_templates": {
    "kind": "direct",
    "purpose": "Шаблоны рабочего дня клиники — без неё нельзя быстро назначить типовой график",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "breaks",
          "end_minute",
          "is_active",
          "name",
          "organization_id",
          "sort_order",
          "start_minute"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_service_location_availability": {
    "kind": "direct",
    "purpose": "Где оказывается услуга — без неё запись не знает, в каком филиале доступна услуга",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "service_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active"
        ]
      }
    ]
  },
  "public.be_specialist_locations": {
    "kind": "direct",
    "purpose": "Специалист ↔ филиал — без неё специалист не привязан к филиалу — слоты не строятся",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingEngine.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "specialist_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active"
        ]
      }
    ]
  },
  "public.be_specialist_rooms": {
    "kind": "direct",
    "purpose": "Специалист ↔ кабинет — распределение по кабинетам при записи",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingEngine.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "room_id",
          "specialist_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active"
        ]
      }
    ]
  },
  "public.be_specialist_service_availability": {
    "kind": "direct",
    "purpose": "Какой специалист какую услугу оказывает — ядро подбора слота: без неё публичная запись пуста",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "city_code",
          "created_at",
          "id",
          "is_active",
          "organization_id",
          "price_minor_override",
          "room_id",
          "service_id",
          "sort_order",
          "specialist_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "city_code",
          "is_active",
          "price_minor_override",
          "room_id",
          "sort_order",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_specialists": {
    "kind": "direct",
    "purpose": "Карточка специалиста клиники — витрина записи и расписание без специалистов не существуют",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDevBypassClinicAdminWorkspace.ts",
      "apps/webapp/src/infra/repos/pgOrganizationMembership.ts",
      "apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "appointment_reminder_allowed_preset_ids",
          "appointment_reminder_default_preset_id",
          "created_at",
          "description",
          "full_name",
          "id",
          "is_active",
          "organization_id",
          "sort_order",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "appointment_reminder_allowed_preset_ids",
          "appointment_reminder_default_preset_id",
          "description",
          "full_name",
          "is_active",
          "organization_id",
          "sort_order",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_subscription_packages": {
    "kind": "direct",
    "purpose": "Абонементы клиники — без неё нельзя продать/списать абонемент",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgMemberships.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "currency",
          "deduction_mode",
          "description",
          "is_active",
          "organization_id",
          "price_minor",
          "title",
          "updated_at",
          "validity_days"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "currency",
          "deduction_mode",
          "description",
          "is_active",
          "price_minor",
          "title",
          "updated_at",
          "validity_days"
        ]
      }
    ]
  },
  "public.be_working_days": {
    "kind": "direct",
    "purpose": "График на конкретную дату (перекрывает недельный) — разовые изменения графика (отпуск, дополнительный день)",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx",
      "apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/modules/booking-calendar/service.ts",
      "apps/webapp/src/modules/booking-scheduling/computeSlots.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "breaks",
          "end_minute",
          "is_closed",
          "organization_id",
          "room_id",
          "specialist_id",
          "start_minute",
          "updated_at",
          "work_date"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "branch_id",
          "breaks",
          "end_minute",
          "is_closed",
          "room_id",
          "start_minute",
          "updated_at"
        ]
      }
    ]
  },
  "public.be_working_hours": {
    "kind": "direct",
    "purpose": "Недельный график — базовое расписание — без него нет ни одного слота",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx",
      "apps/webapp/src/infra/repos/pgBookingScheduling.ts",
      "apps/webapp/src/modules/booking-calendar/service.ts",
      "apps/webapp/src/modules/booking-scheduling/service.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "branch_id",
          "end_minute",
          "is_active",
          "organization_id",
          "room_id",
          "specialist_id",
          "start_minute",
          "weekday"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "end_minute",
          "is_active",
          "start_minute",
          "updated_at",
          "weekday"
        ]
      }
    ]
  },
  "public.broadcast_audit": {
    "kind": "direct",
    "purpose": "Журнал рассылок клиники — без неё нет истории рассылок и счётчиков доставки",
    "codePaths": [
      "apps/integrator/src/infra/db/repos/broadcastAudit.ts",
      "apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts",
      "apps/webapp/src/infra/repos/pgBroadcastAudit.ts",
      "apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts",
      "apps/webapp/src/infra/repos/pgHealthFailureArchive.ts",
      "apps/webapp/src/infra/repos/pgPatientBroadcasts.ts",
      "apps/webapp/src/modules/doctor-broadcasts/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "attach_menu_after_send",
          "audience_filter",
          "audience_size",
          "blocked_recipient_count",
          "category",
          "channels",
          "delivery_jobs_total",
          "error_count",
          "id",
          "message_body",
          "message_title",
          "preview_only",
          "sent_count"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "blocked_recipient_count",
          "error_count",
          "id",
          "sent_count"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "blocked_recipient_count",
          "error_count",
          "sent_count"
        ]
      }
    ]
  },
  "public.broadcast_audit_recipients": {
    "kind": "direct",
    "purpose": "Кому ушла рассылка — пациент видит адресованные ему рассылки; врач — охват",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts",
      "apps/webapp/src/infra/repos/pgPatientBroadcasts.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "audit_id",
          "platform_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "audit_id",
          "platform_user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.broadcast_drafts": {
    "kind": "direct",
    "purpose": "Черновики рассылок — врач теряет несохранённый текст рассылки",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBroadcastDrafts.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "audience",
          "body",
          "category",
          "channels",
          "doctor_user_id",
          "media_type",
          "media_url",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "audience",
          "body",
          "category",
          "channels",
          "media_type",
          "media_url",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.clinic_public_directory_entries": {
    "kind": "direct",
    "purpose": "Публичная витрина клиники — без неё клиника не находится по публичной ссылке записи",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicDirectory.ts",
      "apps/webapp/src/modules/clinic-directory/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "display_name",
          "is_published",
          "organization_id",
          "published_at",
          "slug",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "slug",
          "updated_at"
        ]
      }
    ]
  },
  "public.clinical_anamnesis_illness": {
    "kind": "direct",
    "purpose": "Анамнез: перенесённые болезни и стрессы — без неё врач теряет историю болезней пациента в карточке",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "created_by",
          "organization_id",
          "patient_user_id",
          "period",
          "what"
        ]
      }
    ]
  },
  "public.clinical_anamnesis_lifestyle": {
    "kind": "direct",
    "purpose": "Анамнез: образ жизни — блок «Образ жизни» в карточке пациента",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "organization_id",
          "patient_user_id",
          "record_date",
          "text"
        ]
      }
    ]
  },
  "public.clinical_anamnesis_trauma": {
    "kind": "direct",
    "purpose": "Анамнез: травмы и операции — блок «Травмы и операции»",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "immobilization",
          "organization_id",
          "patient_user_id",
          "type",
          "what",
          "year"
        ]
      }
    ]
  },
  "public.clinical_complaint": {
    "kind": "direct",
    "purpose": "Жалобы пациента — без неё нет списка жалоб и их закрытия",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "organization_id",
          "patient_user_id",
          "priority",
          "source_visit_id",
          "status",
          "text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "organization_id",
          "priority",
          "resolved_at",
          "status",
          "text"
        ]
      }
    ]
  },
  "public.clinical_complaint_update": {
    "kind": "direct",
    "purpose": "Динамика жалобы по визитам — без неё жалоба статична, нет истории «стало лучше/хуже»",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "complaint_id",
          "note",
          "organization_id",
          "resolved",
          "severity",
          "visit_id"
        ]
      }
    ]
  },
  "public.clinical_diagnosis": {
    "kind": "direct",
    "purpose": "Диагнозы пациента — основной клинический артефакт карточки",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/modules/patient-clinical/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "catalog_id",
          "comment",
          "organization_id",
          "patient_user_id",
          "priority",
          "source_visit_id",
          "status",
          "text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "clinical_status",
          "comment",
          "organization_id",
          "priority",
          "resolved_at",
          "status",
          "text"
        ]
      }
    ]
  },
  "public.clinical_diagnosis_catalog": {
    "kind": "direct",
    "purpose": "Справочник диагнозов клиники — врач выбирает диагноз из своего справочника",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "label",
          "note",
          "organization_id"
        ]
      }
    ]
  },
  "public.clinical_diagnosis_status_history": {
    "kind": "direct",
    "purpose": "Журнал смены статуса диагноза — аудит: кто и когда снял/поставил диагноз",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "changed_by",
          "diagnosis_id",
          "new_status",
          "note",
          "old_status",
          "organization_id"
        ]
      }
    ]
  },
  "public.clinical_diagnosis_update": {
    "kind": "direct",
    "purpose": "Уточнения диагноза по визитам — без неё диагноз не уточняется от визита к визиту",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientClinical.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "diagnosis_id",
          "organization_id",
          "refinement",
          "removed",
          "status",
          "visit_id"
        ]
      }
    ]
  },
  "public.clinical_test_regions": {
    "kind": "direct",
    "purpose": "Связка «клинический тест ↔ регион тела» — фильтр тестов по региону тела",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "organization_id",
          "clinical_test_id",
          "body_region_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "body_region_id",
          "clinical_test_id",
          "organization_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.clinical_visit": {
    "kind": "direct",
    "purpose": "Клинический визит — приём как таковой: осмотр, манипуляции, рекомендации",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/patients/[userId]/appointments/unlinked/route.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgPatientFiles.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "anamnesis_text",
          "canonical_appointment_id",
          "created_by",
          "duration",
          "exam",
          "id",
          "location",
          "manipulations",
          "organization_id",
          "patient_user_id",
          "recommendations",
          "service",
          "trial_results",
          "visit_type",
          "visited_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "anamnesis_text",
          "duration",
          "exam",
          "location",
          "manipulations",
          "organization_id",
          "recommendations",
          "trial_results"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.comments": {
    "kind": "direct",
    "purpose": "Комментарии к сущностям — диалог врач↔пациент вокруг упражнений, тестов, программ",
    "codePaths": [
      "apps/integrator/src/infra/adapters/dispatchPort.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/testing/commentsInMemory.ts",
      "apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/comments/route.ts",
      "apps/webapp/src/app/api/doctor/comments/[id]/route.ts",
      "apps/webapp/src/app/api/doctor/comments/exercise-metrics/route.ts",
      "apps/webapp/src/app/api/doctor/comments/patients/[patientUserId]/exercises/route.ts",
      "apps/webapp/src/app/api/doctor/comments/patients/route.ts",
      "apps/webapp/src/app/api/doctor/comments/route.ts",
      "apps/webapp/src/app/api/doctor/exercise-comments/route.ts",
      "apps/webapp/src/app/app/doctor/DoctorTodayAttentionDialog.tsx",
      "apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx",
      "apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx",
      "apps/webapp/src/app/app/doctor/clients/AppointmentStaffCommentsSection.tsx",
      "apps/webapp/src/app/app/doctor/clients/DoctorClientSupportPanel.tsx",
      "apps/webapp/src/app/app/doctor/clients/DoctorProgramOverviewPanel.tsx",
      "apps/webapp/src/app/app/doctor/clients/PatientActionStrip.tsx",
      "apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx",
      "apps/webapp/src/app/app/doctor/comments/DoctorCommentsTab.tsx",
      "apps/webapp/src/app/app/doctor/comments/page.tsx",
      "apps/webapp/src/app/app/doctor/comments/useDoctorExerciseCommentsSearch.ts",
      "apps/webapp/src/app/app/doctor/communications/DoctorCommunicationsShell.tsx",
      "apps/webapp/src/app/app/doctor/communications/DoctorCommunicationsTabsNav.tsx",
      "apps/webapp/src/app/app/doctor/communications/communicationsTabRegistry.ts",
      "apps/webapp/src/app/app/doctor/communications/doctorCommunicationsTabs.ts",
      "apps/webapp/src/app/app/doctor/communications/loadDoctorCommunicationsBadges.ts",
      "apps/webapp/src/app/app/doctor/communications/page.tsx",
      "apps/webapp/src/app/app/doctor/communications/tabs/CommentsTab.tsx",
      "apps/webapp/src/app/app/doctor/dev/chart-test/ChartTestPageClient.tsx",
      "apps/webapp/src/app/app/doctor/loadDoctorExerciseCommentAttention.ts",
      "apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceEditorToolbar.tsx",
      "apps/webapp/src/app/app/patient/treatment/[instanceId]/item/[itemId]/page.tsx",
      "apps/webapp/src/app/app/patient/treatment/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/patient/treatment/loadPatientProgramInteractionBundle.ts",
      "apps/webapp/src/app/app/patient/treatment/program-detail/PatientInstanceStageItemCard.tsx",
      "apps/webapp/src/components/comments/CommentBlock.tsx",
      "apps/webapp/src/infra/repos/inMemoryComments.ts",
      "apps/webapp/src/infra/repos/inMemoryProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgComments.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/middleware/doctorRouteRedirects.ts",
      "apps/webapp/src/modules/auth/sessionCookie.ts",
      "apps/webapp/src/modules/comments/types.ts",
      "apps/webapp/src/modules/doctor-client-card/countDiscussionAttention.ts",
      "apps/webapp/src/modules/doctor-client-card/loadDoctorClientProgramCardAggregates.ts",
      "apps/webapp/src/modules/program-item-discussion/types.ts",
      "apps/webapp/src/shared/ui/chat/MessageComposer.tsx",
      "apps/webapp/src/shared/ui/chat/chatThreadSurface.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "author_id",
          "body",
          "comment_type",
          "organization_id",
          "target_id",
          "target_type"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "body",
          "comment_type",
          "organization_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.content_access_grants_webapp": {
    "kind": "direct",
    "purpose": "Выданные пациенту доступы к контенту — пациент теряет доступ к выданным ему материалам",
    "codePaths": [
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgReminderProjection.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "content_id",
          "created_at",
          "expires_at",
          "integrator_grant_id",
          "integrator_user_id",
          "meta_json",
          "platform_user_id",
          "purpose",
          "revoked_at",
          "token_hash"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "content_id",
          "expires_at",
          "integrator_user_id",
          "meta_json",
          "platform_user_id",
          "purpose",
          "revoked_at",
          "token_hash"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.content_pages": {
    "kind": "direct",
    "purpose": "Страницы CMS — контент, который читает пациент",
    "codePaths": [
      "apps/webapp/src/app-layer/content/revalidatePatientContentPaths.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/reminders/patientWarmupReminderMutationGuard.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app/api/patient/daily-warmup/video-viewed/route.ts",
      "apps/webapp/src/app/api/patient/web-push/subscribe/route.ts",
      "apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx",
      "apps/webapp/src/app/app/doctor/content/ContentRatingChip.tsx",
      "apps/webapp/src/app/app/doctor/content/actions.ts",
      "apps/webapp/src/app/app/doctor/content/contentPageAuthActions.ts",
      "apps/webapp/src/app/app/doctor/content/edit/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/content/inlineEditorActions.ts",
      "apps/webapp/src/app/app/doctor/content/lifecycleActions.ts",
      "apps/webapp/src/app/app/doctor/content/page.tsx",
      "apps/webapp/src/app/app/doctor/content/reorderContentPages.ts",
      "apps/webapp/src/app/app/doctor/content/sections/edit/[slug]/page.tsx",
      "apps/webapp/src/app/app/doctor/content/sections/page.tsx",
      "apps/webapp/src/app/app/doctor/courses/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/material-ratings/[kind]/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/material-ratings/page.tsx",
      "apps/webapp/src/app/app/doctor/patient-home/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/loadTreatmentProgramLibrary.ts",
      "apps/webapp/src/app/app/patient/booking/page.tsx",
      "apps/webapp/src/app/app/patient/cabinet/CabinetInfoLinks.tsx",
      "apps/webapp/src/app/app/patient/content/[slug]/page.tsx",
      "apps/webapp/src/app/app/patient/go/resolvePatientReminderGoTargets.ts",
      "apps/webapp/src/app/app/patient/help/[slug]/page.tsx",
      "apps/webapp/src/app/app/patient/help/page.tsx",
      "apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx",
      "apps/webapp/src/app/app/patient/reminders/RemindersPageBody.tsx",
      "apps/webapp/src/app/app/patient/sections/[slug]/page.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.tsx",
      "apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts",
      "apps/webapp/src/infra/repos/pgContentPages.ts",
      "apps/webapp/src/infra/repos/pgContentSections.ts",
      "apps/webapp/src/infra/repos/pgCourses.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts",
      "apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts",
      "apps/webapp/src/infra/repos/pgReminderRules.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "apps/webapp/src/modules/content-catalog/service.ts",
      "apps/webapp/src/modules/content-sections/content-page-roles.ts",
      "apps/webapp/src/modules/courses/types.ts",
      "apps/webapp/src/modules/emergency/service.ts",
      "apps/webapp/src/modules/help-content/listHelpArticles.ts",
      "apps/webapp/src/modules/lessons/service.ts",
      "apps/webapp/src/modules/material-rating/service.ts",
      "apps/webapp/src/modules/patient-home/blocks.ts",
      "apps/webapp/src/modules/patient-home/buildDailyWarmupPresentationSyncDeps.ts",
      "apps/webapp/src/modules/patient-home/patientHomeBlockItemDisplayTitle.ts",
      "apps/webapp/src/modules/patient-home/patientHomeResolvers.ts",
      "apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts",
      "apps/webapp/src/modules/patient-home/ports.ts",
      "apps/webapp/src/modules/patient-home/service.ts",
      "apps/webapp/src/modules/patient-home/todayConfig.ts",
      "apps/webapp/src/modules/patient-practice/ports.ts",
      "apps/webapp/src/modules/patient-practice/service.ts",
      "apps/webapp/src/modules/treatment-program/types.ts",
      "apps/webapp/src/modules/web-push/createLoadWarmupPushContext.ts",
      "apps/webapp/src/modules/web-push/loadWarmupPushDynamicContext.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "body_html",
          "body_md",
          "image_url",
          "is_published",
          "linked_course_id",
          "organization_id",
          "requires_auth",
          "section",
          "slug",
          "sort_order",
          "summary",
          "title",
          "updated_at",
          "video_type",
          "video_url"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "archived_at",
          "body_html",
          "body_md",
          "deleted_at",
          "image_url",
          "is_published",
          "linked_course_id",
          "organization_id",
          "requires_auth",
          "section",
          "slug",
          "sort_order",
          "summary",
          "title",
          "updated_at",
          "video_type",
          "video_url"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.content_section_slug_history": {
    "kind": "direct",
    "purpose": "История переименований разделов — старые ссылки пациента не ломаются после переименования",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgContentSections.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "changed_by_user_id",
          "new_slug",
          "old_slug",
          "organization_id"
        ]
      }
    ]
  },
  "public.content_sections": {
    "kind": "direct",
    "purpose": "Разделы CMS — навигация пациентского контента",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/reminders/patientWarmupReminderMutationGuard.ts",
      "apps/webapp/src/app/api/menu/route.ts",
      "apps/webapp/src/app/api/patient/daily-warmup/video-viewed/route.ts",
      "apps/webapp/src/app/api/patient/web-push/subscribe/route.ts",
      "apps/webapp/src/app/app/doctor/content/actions.ts",
      "apps/webapp/src/app/app/doctor/content/contentPageAuthActions.ts",
      "apps/webapp/src/app/app/doctor/content/edit/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/content/inlineEditorActions.ts",
      "apps/webapp/src/app/app/doctor/content/lifecycleActions.ts",
      "apps/webapp/src/app/app/doctor/content/new/page.tsx",
      "apps/webapp/src/app/app/doctor/content/page.tsx",
      "apps/webapp/src/app/app/doctor/content/reorderContentPages.ts",
      "apps/webapp/src/app/app/doctor/content/sections/actions.ts",
      "apps/webapp/src/app/app/doctor/content/sections/edit/[slug]/page.tsx",
      "apps/webapp/src/app/app/doctor/content/sections/page.tsx",
      "apps/webapp/src/app/app/doctor/content/sections/reorderContentSections.ts",
      "apps/webapp/src/app/app/doctor/content/sections/sectionVisibilityActions.ts",
      "apps/webapp/src/app/app/doctor/patient-home/page.tsx",
      "apps/webapp/src/app/app/patient/content/[slug]/page.tsx",
      "apps/webapp/src/app/app/patient/go/resolvePatientReminderGoTargets.ts",
      "apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx",
      "apps/webapp/src/app/app/patient/reminders/RemindersPageBody.tsx",
      "apps/webapp/src/app/app/patient/sections/[slug]/page.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.tsx",
      "apps/webapp/src/app/app/settings/patient-home/actions.ts",
      "apps/webapp/src/infra/repos/pgContentPages.ts",
      "apps/webapp/src/infra/repos/pgContentSections.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts",
      "apps/webapp/src/infra/repos/pgWarmupsSectionSlugs.ts",
      "apps/webapp/src/modules/content-sections/resolvePatientContentSectionSlug.ts",
      "apps/webapp/src/modules/content-sections/types.ts",
      "apps/webapp/src/modules/menu/service.ts",
      "apps/webapp/src/modules/patient-diary/buildDiaryPlanReminderStrip.ts",
      "apps/webapp/src/modules/patient-home/blocks.ts",
      "apps/webapp/src/modules/patient-home/buildDailyWarmupPresentationSyncDeps.ts",
      "apps/webapp/src/modules/patient-home/patientHomeBlockItemDisplayTitle.ts",
      "apps/webapp/src/modules/patient-home/patientHomeProgressResolver.ts",
      "apps/webapp/src/modules/patient-home/patientHomeResolvers.ts",
      "apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts",
      "apps/webapp/src/modules/patient-home/service.ts",
      "apps/webapp/src/modules/patient-home/todayConfig.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsPageKey.ts",
      "apps/webapp/src/modules/reminders/ensureWarmupsReminderOnFirstPwaPush.ts",
      "apps/webapp/src/modules/reminders/service.ts",
      "apps/webapp/src/modules/web-push/createLoadWarmupPushContext.ts",
      "apps/webapp/src/modules/web-push/loadWarmupPushDynamicContext.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT",
          "UPDATE"
        ],
        "columns": [
          "cover_image_url",
          "description",
          "icon_image_url",
          "is_visible",
          "kind",
          "organization_id",
          "requires_auth",
          "slug",
          "sort_order",
          "system_parent_code",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.courses": {
    "kind": "direct",
    "purpose": "Курсы клиники — платный/бесплатный курс как продукт клиники",
    "codePaths": [
      "apps/integrator/src/infra/adapters/contentCatalogPort.ts",
      "apps/integrator/src/kernel/contracts/reminders.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/routes/paths.ts",
      "apps/webapp/src/app/api/doctor/courses/[id]/route.ts",
      "apps/webapp/src/app/api/doctor/courses/[id]/usage/route.ts",
      "apps/webapp/src/app/api/doctor/courses/route.ts",
      "apps/webapp/src/app/api/patient/courses/[courseId]/enroll/route.ts",
      "apps/webapp/src/app/api/patient/courses/route.ts",
      "apps/webapp/src/app/app/doctor/content/ContentHubShell.tsx",
      "apps/webapp/src/app/app/doctor/content/actions.ts",
      "apps/webapp/src/app/app/doctor/content/edit/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/content/new/page.tsx",
      "apps/webapp/src/app/app/doctor/content/page.tsx",
      "apps/webapp/src/app/app/doctor/courses/[id]/DoctorCourseEditForm.tsx",
      "apps/webapp/src/app/app/doctor/courses/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/courses/courseUsageDocLinks.ts",
      "apps/webapp/src/app/app/doctor/courses/courseUsageSummaryText.ts",
      "apps/webapp/src/app/app/doctor/courses/new/DoctorCourseDraftCreateForm.tsx",
      "apps/webapp/src/app/app/doctor/courses/new/page.tsx",
      "apps/webapp/src/app/app/doctor/courses/page.tsx",
      "apps/webapp/src/app/app/doctor/loadDoctorWorkspaceShell.ts",
      "apps/webapp/src/app/app/doctor/patient-home/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.ts",
      "apps/webapp/src/app/app/patient/content/[slug]/PatientContentSlugArticle.tsx",
      "apps/webapp/src/app/app/patient/courses/PatientCoursesCatalogClient.tsx",
      "apps/webapp/src/app/app/patient/courses/page.tsx",
      "apps/webapp/src/app/app/patient/home/PatientHomeCoursesRow.tsx",
      "apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx",
      "apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx",
      "apps/webapp/src/app/app/patient/page.tsx",
      "apps/webapp/src/app/app/patient/sections/[slug]/page.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx",
      "apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.tsx",
      "apps/webapp/src/app/app/settings/patient-home/actions.ts",
      "apps/webapp/src/infra/repos/inMemoryCourses.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientHomeBlocks.ts",
      "apps/webapp/src/infra/repos/pgContentPages.ts",
      "apps/webapp/src/infra/repos/pgCourses.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/modules/content-catalog/ports.ts",
      "apps/webapp/src/modules/courses/service.ts",
      "apps/webapp/src/modules/org-entitlements/types.ts",
      "apps/webapp/src/modules/patient-home/blockEditorMetadata.ts",
      "apps/webapp/src/modules/patient-home/blocks.ts",
      "apps/webapp/src/modules/patient-home/patientHomeBlockItemDisplayTitle.ts",
      "apps/webapp/src/modules/patient-home/patientHomeCmsReturnUrls.ts",
      "apps/webapp/src/modules/patient-home/patientHomeResolvers.ts",
      "apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.ts",
      "apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts",
      "apps/webapp/src/modules/patient-home/ports.ts",
      "apps/webapp/src/modules/patient-home/service.ts",
      "apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsPageKey.ts",
      "apps/webapp/src/shared/lib/doctorCatalogListStatus.ts",
      "apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts",
      "apps/webapp/src/shared/ui/doctorScreenTitles.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "access_settings",
          "currency",
          "description",
          "intro_lesson_page_id",
          "organization_id",
          "price_minor",
          "program_template_id",
          "status",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "access_settings",
          "currency",
          "description",
          "intro_lesson_page_id",
          "price_minor",
          "program_template_id",
          "status",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.doctor_notes": {
    "kind": "direct",
    "purpose": "Заметки врача о пациенте — личные пометки врача по клиенту",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/doctor/clients/[userId]/notes/route.ts",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgClientHistory.ts",
      "apps/webapp/src/infra/repos/pgDoctorNotes.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "author_id",
          "organization_id",
          "text",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "author_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.doctor_patient_support": {
    "kind": "direct",
    "purpose": "Флаги сопровождения пациента — определяет, ведёт ли врач клиента и открыты ли ему чат/медиа",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/calendarDescription.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgDoctorPatientSupport.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/doctor-clients/supportPolicy.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comments_enabled",
          "media_enabled",
          "on_support",
          "organization_id",
          "patient_user_id",
          "support_started_at",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "comments_enabled",
          "media_enabled",
          "organization_id",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "on_support",
          "patient_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comments_enabled",
          "media_enabled",
          "on_support",
          "organization_id",
          "patient_user_id",
          "support_started_at",
          "updated_at",
          "updated_by"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "comments_enabled",
          "media_enabled",
          "organization_id",
          "updated_at",
          "updated_by"
        ]
      }
    ]
  },
  "public.lfk_complex_exercises": {
    "kind": "direct",
    "purpose": "Строки комплекса пациента — сам состав назначения (что и сколько делать)",
    "codePaths": [
      "apps/webapp/src/infra/repos/lfkDiary.ts",
      "apps/webapp/src/infra/repos/pgLfkAssignments.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "complex_id",
          "exercise_id",
          "local_comment",
          "max_pain_0_10",
          "organization_id",
          "reps",
          "sets",
          "side",
          "sort_order"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "local_comment"
        ]
      }
    ]
  },
  "public.lfk_complex_template_exercises": {
    "kind": "direct",
    "purpose": "Строки шаблона — состав шаблонного комплекса",
    "codePaths": [
      "apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts",
      "apps/webapp/src/infra/repos/pgLfkAssignments.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "exercise_id",
          "max_pain_0_10",
          "organization_id",
          "owner_kind",
          "reps",
          "sets",
          "side",
          "sort_order",
          "template_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.lfk_complex_templates": {
    "kind": "direct",
    "purpose": "Шаблоны комплексов — библиотека готовых комплексов клиники и платформы",
    "codePaths": [
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgLfkAssignments.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.ts",
      "apps/webapp/src/modules/material-rating/mapProgramItemToTarget.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "description",
          "organization_id",
          "owner_kind",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "created_by",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.lfk_complexes": {
    "kind": "direct",
    "purpose": "Назначенные пациенту комплексы ЛФК — без неё пациент не получает назначенных упражнений",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/DoctorClientAccountTab.tsx",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/clients/loadDoctorClientProfileCardProps.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgDiaryPurge.ts",
      "apps/webapp/src/infra/repos/pgLfkAssignments.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "apps/webapp/src/modules/doctor-clients/service.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "diagnosis_ref_id",
          "diagnosis_text",
          "is_active",
          "organization_id",
          "origin",
          "platform_user_id",
          "region_ref_id",
          "side",
          "symptom_tracking_id",
          "title",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_active",
          "symptom_tracking_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "columns": [
          "platform_user_id",
          "user_id"
        ]
      }
    ]
  },
  "public.lfk_exercise_media": {
    "kind": "direct",
    "purpose": "Видео/картинки упражнения — пациент не видит показ упражнения",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/exercises/exerciseMediaFromLibrary.ts",
      "apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgOrgBranding.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/modules/lfk-templates/types.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "exercise_id",
          "media_type",
          "media_url",
          "organization_id",
          "owner_kind",
          "sort_order"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.lfk_exercise_regions": {
    "kind": "direct",
    "purpose": "Упражнение ↔ регион тела — фильтр упражнений по региону",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/modules/lfk-exercises/types.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "exercise_id",
          "organization_id",
          "owner_kind",
          "region_ref_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.lfk_exercises": {
    "kind": "direct",
    "purpose": "Каталог упражнений — без каталога упражнений нет назначений",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/app/doctor/exercises/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/exercises/actions.ts",
      "apps/webapp/src/app/app/doctor/exercises/actionsShared.ts",
      "apps/webapp/src/app/app/doctor/exercises/page.tsx",
      "apps/webapp/src/app/app/doctor/lfk-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/lfk-templates/new/page.tsx",
      "apps/webapp/src/app/app/doctor/lfk-templates/page.tsx",
      "apps/webapp/src/app/app/doctor/material-ratings/[kind]/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/material-ratings/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/loadTreatmentProgramLibrary.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts",
      "apps/webapp/src/modules/lfk-templates/types.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "catalog_scope",
          "contraindications",
          "created_by",
          "description",
          "difficulty_1_10",
          "load_type",
          "organization_id",
          "owner_kind",
          "region_ref_id",
          "tags",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "created_by",
          "is_archived",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.lfk_sessions": {
    "kind": "direct",
    "purpose": "Дневник выполнения ЛФК — без неё нет дневника и статистики выполнения",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/patients/[userId]/exercise-calendar/route.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "completed_at",
          "complex_id",
          "difficulty_0_10",
          "duration_minutes",
          "pain_0_10",
          "recorded_at",
          "source",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "comment",
          "completed_at",
          "difficulty_0_10",
          "duration_minutes",
          "pain_0_10"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.manual_patient_commands": {
    "kind": "direct",
    "purpose": "Идемпотентность ручных команд по пациенту — защита от двойного выполнения ручной команды (приглашение и т.п.)",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgManualPatientCommand.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "command_id",
          "command_kind",
          "organization_id",
          "platform_user_id",
          "request_fingerprint"
        ]
      }
    ]
  },
  "public.material_ratings": {
    "kind": "direct",
    "purpose": "Оценки материалов пациентом — обратная связь по материалам, отчёты врачу",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgMaterialRating.ts",
      "apps/webapp/src/modules/material-rating/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "organization_id",
          "stars",
          "target_id",
          "target_kind",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "stars",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "stars",
          "target_id",
          "target_kind",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "stars",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.media_files": {
    "kind": "direct",
    "purpose": "Файлы медиатеки — хранилище всех медиа: видео упражнений, логотипы, файлы пациента",
    "codePaths": [
      "apps/media-worker/src/jobs/claim.ts",
      "apps/media-worker/src/main.ts",
      "apps/media-worker/src/persistVideoDurationSeconds.ts",
      "apps/media-worker/src/processProgramSubmissionTranscode.ts",
      "apps/media-worker/src/processTranscodeJob.ts",
      "apps/webapp/src/app-layer/media/authorizeMediaDelivery.ts",
      "apps/webapp/src/app-layer/stats/estimateWatchMinutes.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app/api/admin/media/delete-errors/route.ts",
      "apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts",
      "apps/webapp/src/app/api/internal/media-preview/process/route.ts",
      "apps/webapp/src/app/api/internal/media-transcode/enqueue/route.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/materialRatingTargetVideoMediaIds.ts",
      "apps/webapp/src/infra/repos/mediaFoldersRepo.ts",
      "apps/webapp/src/infra/repos/mediaHlsLegacySqlFilters.ts",
      "apps/webapp/src/infra/repos/mediaPreviewWorker.ts",
      "apps/webapp/src/infra/repos/mediaSqlPredicates.ts",
      "apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts",
      "apps/webapp/src/infra/repos/pgAdminTranscodeHealthMetrics.ts",
      "apps/webapp/src/infra/repos/pgLfkDiary.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgMediaFileIntakeResolve.ts",
      "apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts",
      "apps/webapp/src/infra/repos/pgOrgBranding.ts",
      "apps/webapp/src/infra/repos/pgPatientFiles.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/infra/repos/pgVideoHlsLegacyBackfill.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "apps/webapp/src/infra/s3/client.ts",
      "apps/webapp/src/infra/strictPlatformUserPurge.ts",
      "apps/webapp/src/modules/content-catalog/types.ts",
      "apps/webapp/src/modules/lfk-exercises/types.ts",
      "apps/webapp/src/modules/media/playbackResolveDelivery.ts",
      "apps/webapp/src/modules/media/types.ts",
      "apps/webapp/src/modules/media/videoHlsFields.ts",
      "apps/webapp/src/modules/patient-files/ports.ts",
      "apps/webapp/src/shared/lib/mediaPreviewUrls.ts",
      "apps/webapp/src/shared/lib/mediaUrlPolicy.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "display_name",
          "folder_id",
          "id",
          "mime_type",
          "organization_id",
          "original_name",
          "preview_status",
          "s3_key",
          "size_bytes",
          "status",
          "stored_path",
          "uploaded_by",
          "usage_purpose",
          "video_delivery_override"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "delete_attempts",
          "display_name",
          "folder_id",
          "next_attempt_at",
          "organization_id",
          "preview_attempts",
          "preview_md_key",
          "preview_next_attempt_at",
          "preview_sm_key",
          "preview_status",
          "source_height",
          "source_width",
          "status",
          "video_processing_error",
          "video_processing_status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "uploaded_by"
        ]
      }
    ]
  },
  "public.media_folders": {
    "kind": "direct",
    "purpose": "Папки медиатеки, в т.ч. личные папки пациентов — файлы клиента и библиотека клиники раскладываются по папкам",
    "codePaths": [
      "apps/webapp/src/infra/repos/mediaFoldersRepo.ts",
      "apps/webapp/src/infra/repos/pgClientMediaFolders.ts",
      "apps/webapp/src/infra/repos/pgMediaFolderLookup.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "kind",
          "name",
          "organization_id",
          "parent_id",
          "patient_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "kind",
          "name",
          "organization_id",
          "parent_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.media_playback_user_video_first_resolve": {
    "kind": "direct",
    "purpose": "отметка «впервые досмотрел видео» — без неё нет метрики первого просмотра",
    "codePaths": [
      "apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts",
      "apps/webapp/src/app-layer/media/playbackHourlyRetention.ts",
      "apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts",
      "apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts",
      "apps/webapp/src/infra/repos/pgMaterialRating.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "media_id",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.media_upload_sessions": {
    "kind": "direct",
    "purpose": "сессия многочастной загрузки файла — без неё нельзя загрузить файл/видео кусками (обрывы, докачка)",
    "codePaths": [
      "apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "expected_size_bytes",
          "expires_at",
          "id",
          "media_id",
          "mime_type",
          "owner_user_id",
          "part_size_bytes",
          "s3_key",
          "status",
          "upload_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "completed_at",
          "last_error",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "owner_user_id"
        ]
      }
    ]
  },
  "public.message_log": {
    "kind": "direct",
    "purpose": "журнал отправленных человеку сообщений — без неё врач не видит историю переписки с пациентом и не доказать факт отправки",
    "codePaths": [
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgMessageLog.ts",
      "apps/webapp/src/modules/doctor-cabinet/service.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "category",
          "channel_bindings_used",
          "error_message",
          "outcome",
          "platform_user_id",
          "sender_id",
          "text",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id",
          "user_id"
        ]
      }
    ]
  },
  "public.motivational_quotes": {
    "kind": "direct",
    "purpose": "мотивационные цитаты клиники — без неё пропадает блок цитаты на главной пациента",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgDoctorMotivationQuotesEditor.ts",
      "apps/webapp/src/infra/repos/pgPatientHomeLegacyContent.ts",
      "apps/webapp/src/modules/doctor-motivation-quotes/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "author",
          "body_text",
          "is_active",
          "sort_order"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "archived_at",
          "author",
          "body_text",
          "is_active",
          "sort_order"
        ]
      }
    ]
  },
  "public.notification_delivery_attempts": {
    "kind": "direct",
    "purpose": "попытки доставки уведомления — без неё не видно, дошло ли напоминание, и не работает диагностика доставки",
    "codePaths": [
      "apps/integrator/src/infra/db/repos/notificationDeliveryAttempts.ts",
      "apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts",
      "apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts",
      "apps/webapp/src/app-layer/health/adminWebPushHealthMetrics.ts",
      "apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts",
      "apps/webapp/src/infra/repos/pgNotificationDeliveryAttempts.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel",
          "endpoint_hash",
          "error_message",
          "event_id",
          "integrator_user_id",
          "intent_type",
          "metadata",
          "occurrence_id",
          "organization_id",
          "provider_status_code",
          "reason",
          "recipient_ref",
          "status",
          "topic_code",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "channel",
          "error_message",
          "event_id",
          "integrator_user_id",
          "intent_type",
          "metadata",
          "occurrence_id",
          "organization_id",
          "provider_status_code",
          "reason",
          "recipient_ref",
          "status",
          "topic_code",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel",
          "error_message",
          "event_id",
          "integrator_user_id",
          "intent_type",
          "metadata",
          "occurrence_id",
          "organization_id",
          "provider_status_code",
          "reason",
          "recipient_ref",
          "status",
          "topic_code",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.online_intake_answers": {
    "kind": "no-runtime-surface",
    "purpose": "ответы на анкету первичного обращения — без неё теряется содержимое онлайн-заявки пациента",
    "evidence": [
      "node /home/dev/brain/tools/code-search.mjs \"online intake answers attachments status history repository\" --repo bcb -k 12: schema/migrations only",
      "rg -n \"onlineIntakeAnswers|online_intake_answers\" apps/webapp/src apps/integrator/src packages -g !tests -g !migrations: no runtime reader/writer",
      "evidence/14-classification-part-3.md:57: no application reader/writer"
    ]
  },
  "public.online_intake_attachments": {
    "kind": "direct",
    "purpose": "файлы к анкете — без неё не удалить файлы пациента из S3 при purge; без неё не приложить документы к заявке",
    "codePaths": [
      "apps/webapp/src/infra/platformUserFullPurge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.online_intake_requests": {
    "kind": "direct",
    "purpose": "сама заявка — без неё нет входящего потока онлайн-обращений",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.online_intake_status_history": {
    "kind": "no-runtime-surface",
    "purpose": "смена статуса заявки — без неё нет аудита «кто перевёл заявку в отказ»",
    "evidence": [
      "node /home/dev/brain/tools/code-search.mjs \"online intake answers attachments status history repository\" --repo bcb -k 12: schema/migrations only",
      "rg -n \"onlineIntakeStatusHistory|online_intake_status_history\" apps/webapp/src apps/integrator/src packages -g !tests -g !migrations: no runtime reader/writer",
      "evidence/14-classification-part-3.md:60: migration + one-off script only"
    ]
  },
  "public.operator_health_failure_archive": {
    "kind": "direct",
    "purpose": "архив разобранных отказов здоровья — без неё админ не может «закрыть» разобранный инцидент и он висит вечно",
    "codePaths": [
      "apps/webapp/src/app/api/admin/health-failure-archive/route.ts",
      "apps/webapp/src/infra/repos/pgHealthFailureArchive.ts",
      "apps/webapp/src/modules/operator-health/healthFailureArchivePort.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "archived_by_user_id",
          "doctor_user_id",
          "health_probe",
          "raw_error_truncated",
          "severity_at_archive",
          "source_id",
          "source_kind",
          "summary_json"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.org_brand_revisions": {
    "kind": "direct",
    "purpose": "ревизии брендинга клиники — без неё клиника не может менять логотип/название с версионированием",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgOrgBranding.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by_platform_user_id",
          "display_name",
          "logo_media_id",
          "organization_id",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "archived_at",
          "archived_by_platform_user_id",
          "display_name",
          "logo_media_id",
          "published_at",
          "published_by_platform_user_id",
          "status",
          "updated_at"
        ]
      }
    ]
  },
  "public.org_enrollments": {
    "kind": "direct",
    "purpose": "прикрепление человека к клинике — на неё опирается вся стена арендатора",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/resolveDirectPublicActor.ts",
      "apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts",
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/migrate.ts",
      "apps/integrator/src/infra/db/repos/channelUsers.ts",
      "apps/integrator/src/infra/db/repos/integratorUserOrganizationSql.ts",
      "apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts",
      "apps/integrator/src/infra/db/repos/messageThreads.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgPatientInvites.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "organization_id",
          "platform_user_id",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "organization_id",
          "platform_user_id",
          "status"
        ]
      }
    ]
  },
  "public.organization_member_invites": {
    "kind": "direct",
    "purpose": "приглашения сотрудников — без неё нельзя завести второго врача в клинику",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgOrganizationInvites.ts",
      "apps/webapp/src/infra/repos/seatUsageSql.ts",
      "apps/webapp/src/infra/repos/transactionQuotaPort.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by_platform_user_id",
          "expires_at",
          "invited_email",
          "invited_role",
          "organization_id",
          "token_hash"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "status"
        ]
      }
    ]
  },
  "public.organization_slug_claims": {
    "kind": "direct",
    "purpose": "занятые адреса клиник — без неё две клиники займут один публичный адрес",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicDirectory.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT",
          "UPDATE"
        ],
        "columns": [
          "created_by_platform_user_id",
          "kind",
          "organization_id",
          "slug",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.organization_slug_rename_events": {
    "kind": "direct",
    "purpose": "журнал переименований — без неё нет аудита смены публичного адреса",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicDirectory.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_platform_user_id",
          "next_slug",
          "organization_id",
          "previous_slug"
        ]
      }
    ]
  },
  "public.patient_bookings": {
    "kind": "direct",
    "purpose": "старые записи на приём — легаси-таблица записей; без неё теряется история бронирований до перехода на `be_appointments`",
    "codePaths": [
      "apps/integrator/src/infra/db/repos/bookingCalendarMap.ts",
      "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
      "apps/webapp/src/app-layer/booking/appointmentPaymentConfirmedHandler.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/patient/cabinet/CabinetBookingActions.tsx",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgPatientBookings.ts",
      "apps/webapp/src/modules/patient-booking/canonicalCreate.ts",
      "apps/webapp/src/modules/patient-booking/types.ts",
      "apps/webapp/src/modules/payments/prepaymentContextFromBooking.ts",
      "packages/platform-merge/src/mergeFailureClassification.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "booking_type",
          "branch_id",
          "branch_service_id",
          "branch_title_snapshot",
          "category",
          "city",
          "city_code_snapshot",
          "contact_email",
          "contact_name",
          "contact_phone",
          "duration_minutes_snapshot",
          "id",
          "organization_id",
          "platform_user_id",
          "price_minor_snapshot",
          "service_id",
          "service_title_snapshot",
          "slot_end",
          "slot_start",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "cancel_reason",
          "cancelled_at",
          "canonical_appointment_id",
          "slot_end",
          "slot_start",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "platform_user_id",
          "slot_end",
          "slot_start",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      }
    ]
  },
  "public.patient_comorbidity": {
    "kind": "direct",
    "purpose": "сопутствующие заболевания — без неё врач не видит фон пациента",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientComorbidities.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "organization_id",
          "patient_user_id",
          "since",
          "status",
          "text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "organization_id",
          "removed_at",
          "since",
          "status",
          "text"
        ]
      }
    ]
  },
  "public.patient_content_rating_feedback": {
    "kind": "direct",
    "purpose": "оценка материала пациентом — без неё нет обратной связи по контенту",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgMaterialRatingFeedback.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "content_page_id",
          "organization_id",
          "rating_value",
          "reason_codes",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.patient_daily_warmup_presentations": {
    "kind": "direct",
    "purpose": "какая «разминка дня» показана пациенту — без неё не ротируется ежедневный контент — пациент видит одно и то же",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientDailyWarmupPresentation.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "content_page_id",
          "last_rotation_at",
          "skip_next_scheduled_rotation",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "content_page_id",
          "last_rotation_at",
          "skip_next_scheduled_rotation",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "content_page_id",
          "last_rotation_at",
          "skip_next_scheduled_rotation",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "content_page_id",
          "last_rotation_at",
          "skip_next_scheduled_rotation",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.patient_daily_warmup_video_views": {
    "kind": "direct",
    "purpose": "просмотры видео-разминки — без неё нет отметки «сделал разминку» и админ-статистики",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app/api/patient/daily-warmup/video-viewed/route.ts",
      "apps/webapp/src/infra/repos/pgPatientDailyWarmupVideoView.ts",
      "apps/webapp/src/modules/patient-home/recordDailyWarmupVideoView.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "content_page_id",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.patient_diary_day_snapshots": {
    "kind": "direct",
    "purpose": "слепок дня пациента — без неё дневник и «активность по дням» в карточке пациента пусты",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/clients/[userId]/program-day-activity/route.ts",
      "apps/webapp/src/infra/repos/pgPatientDiarySnapshots.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "captured_at",
          "iana",
          "local_date",
          "organization_id",
          "plan_done_mask",
          "plan_instance_id",
          "plan_item_ids",
          "platform_user_id",
          "warmup_all_done",
          "warmup_done_count",
          "warmup_slot_limit"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "local_date",
          "platform_user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.patient_files": {
    "kind": "direct",
    "purpose": "файлы в карте пациента — без неё нет медицинских документов в карте и не считается квота хранилища клиники",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/files/[fileId]/confirm/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgPatientFiles.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "apps/webapp/src/infra/strictPlatformUserPurge.ts",
      "apps/webapp/src/modules/patient-clinical/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "category",
          "file_name",
          "media_file_id",
          "mime_type",
          "organization_id",
          "patient_user_id",
          "s3_bucket",
          "s3_key",
          "size_bytes",
          "uploaded_by_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "file_name",
          "organization_id",
          "size_bytes",
          "visit_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.patient_home_block_items": {
    "kind": "direct",
    "purpose": "элементы блоков — без неё блоки пустые",
    "codePaths": [
      "apps/webapp/src/app/app/patient/page.tsx",
      "apps/webapp/src/app/app/settings/patient-home/actions.ts",
      "apps/webapp/src/infra/repos/pgContentSections.ts",
      "apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts",
      "apps/webapp/src/modules/patient-home/usefulPostPresentation.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "badge_label",
          "block_code",
          "image_url_override",
          "is_visible",
          "show_title",
          "sort_order",
          "subtitle_override",
          "target_ref",
          "target_type",
          "title_override"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "badge_label",
          "image_url_override",
          "is_visible",
          "organization_id",
          "show_title",
          "sort_order",
          "subtitle_override",
          "target_ref",
          "target_type",
          "title_override",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.patient_home_blocks": {
    "kind": "direct",
    "purpose": "блоки главной пациента (настройка клиники) — без неё главная пациента пустая",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/reminders/patientWarmupReminderMutationGuard.ts",
      "apps/webapp/src/app/api/patient/daily-warmup/video-viewed/route.ts",
      "apps/webapp/src/app/api/patient/web-push/subscribe/route.ts",
      "apps/webapp/src/app/app/doctor/content/actions.ts",
      "apps/webapp/src/app/app/doctor/patient-home/page.tsx",
      "apps/webapp/src/app/app/patient/content/[slug]/page.tsx",
      "apps/webapp/src/app/app/patient/go/resolvePatientReminderGoTargets.ts",
      "apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx",
      "apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx",
      "apps/webapp/src/app/app/patient/page.tsx",
      "apps/webapp/src/app/app/patient/sections/[slug]/page.tsx",
      "apps/webapp/src/app/app/settings/patient-home/actions.ts",
      "apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts",
      "apps/webapp/src/modules/patient-home/buildDailyWarmupPresentationSyncDeps.ts",
      "apps/webapp/src/modules/patient-home/todayConfig.ts",
      "apps/webapp/src/modules/web-push/createLoadWarmupPushContext.ts",
      "apps/webapp/src/modules/web-push/loadWarmupPushDynamicContext.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "icon_image_url",
          "is_visible",
          "sort_order",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.patient_invites": {
    "kind": "direct",
    "purpose": "приглашение пациента в портал — без неё врач не может пригласить пациента в личный кабинет",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/portal-invite/route.ts",
      "apps/webapp/src/app/api/join/email/confirm/route.ts",
      "apps/webapp/src/app/api/join/email/start/route.ts",
      "apps/webapp/src/app/api/join/exchange/route.ts",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts",
      "apps/webapp/src/app/join/[continuation]/page.tsx",
      "apps/webapp/src/infra/repos/pgPatientInvites.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by_platform_user_id",
          "enrollment_id",
          "expires_at",
          "id",
          "invited_email_normalized",
          "organization_id",
          "patient_user_id",
          "recipient_binding",
          "token_hash"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "proof_code_hash",
          "proof_expires_at",
          "revoked_at",
          "revoked_by_platform_user_id",
          "status",
          "superseded_by_invite_id",
          "updated_at"
        ]
      }
    ]
  },
  "public.patient_lfk_assignments": {
    "kind": "direct",
    "purpose": "назначенные пациенту комплексы ЛФК — без неё пациент не видит назначенных упражнений",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgDiaryPurge.ts",
      "apps/webapp/src/infra/repos/pgLfkAssignments.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "packages/platform-merge/src/mergeFailureClassification.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "assigned_by",
          "complex_id",
          "is_active",
          "organization_id",
          "patient_user_id",
          "template_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "assigned_at",
          "assigned_by",
          "complex_id",
          "is_active"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "is_active",
          "organization_id",
          "patient_user_id",
          "template_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "patient_user_id"
        ]
      }
    ]
  },
  "public.patient_merge_candidates": {
    "kind": "direct",
    "purpose": "кандидаты на слияние дублей пациента — без неё дубли пациентов не всплывают админу клиники",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "anchor_user_id",
          "candidate_user_id",
          "organization_id",
          "payload",
          "reason",
          "status",
          "trigger_appointment_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "resolved_at",
          "resolved_by",
          "status"
        ]
      }
    ]
  },
  "public.patient_payment": {
    "kind": "direct",
    "purpose": "платежи пациента — без неё нет финансовой истории по пациенту",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/patients/[userId]/acquiring-charge/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/payment-timeline/route.ts",
      "apps/webapp/src/infra/repos/pgPatientPayments.ts",
      "apps/webapp/src/modules/patient-payments/service.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "comment",
          "created_by",
          "currency",
          "kind",
          "organization_id",
          "patient_user_id",
          "provider",
          "provider_payment_id",
          "service",
          "status",
          "visit_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "provider_payment_id",
          "status"
        ]
      }
    ]
  },
  "public.patient_practice_completions": {
    "kind": "direct",
    "purpose": "выполненные практики и самочувствие — без неё нет календаря упражнений и трекинга самочувствия",
    "codePaths": [
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/exercise-calendar/route.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts",
      "apps/webapp/src/infra/repos/pgWarmupFeelingCompletion.ts",
      "apps/webapp/src/modules/diaries/ports.ts",
      "apps/webapp/src/modules/patient-practice/warmupFeelingCompletionPort.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "content_page_id",
          "feeling",
          "notes",
          "source",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "feeling"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.patient_specialist_links": {
    "kind": "direct",
    "purpose": "связь «пациент ↔ специалист» — без неё «свой пациент» невыразим (VISIBILITY_MODEL_GAP §1)",
    "codePaths": [
      "apps/webapp/src/infra/repos/patientVisibilityPredicateSql.ts",
      "apps/webapp/src/infra/repos/pgPatientVisibilityLinks.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_via",
          "organization_id",
          "patient_user_id",
          "specialist_id",
          "status"
        ]
      }
    ]
  },
  "public.platform_user_contacts": {
    "kind": "direct",
    "purpose": "дополнительные контакты человека — без неё нет запасных телефонов/почт пациента для связи и дедупликации",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/doctor/clients/[userId]/supplementary-contacts/[contactId]/route.ts",
      "apps/webapp/src/app/api/doctor/clients/[userId]/supplementary-contacts/route.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgPlatformUserContacts.ts",
      "apps/webapp/src/modules/patient-booking/canonicalCreate.ts",
      "apps/webapp/src/modules/patient-booking/service.ts",
      "packages/platform-merge/src/mergeContactFallback.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "contact_type",
          "created_at",
          "organization_id",
          "platform_user_id",
          "source",
          "updated_at",
          "value",
          "value_normalized"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "organization_id",
          "source",
          "updated_at",
          "value"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "contact_type",
          "created_at",
          "id",
          "platform_user_id",
          "source",
          "updated_at",
          "value",
          "value_normalized"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "contact_type",
          "created_at",
          "organization_id",
          "platform_user_id",
          "source",
          "updated_at",
          "value",
          "value_normalized"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "source",
          "updated_at",
          "value"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.platform_users": {
    "kind": "direct",
    "purpose": "единственная таблица ПДн — без неё нет ни одного человека в системе",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/resolveDirectPublicActor.ts",
      "apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts",
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/repos/channelUsers.ts",
      "apps/integrator/src/infra/db/repos/integratorUserOrganizationSql.ts",
      "apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts",
      "apps/integrator/src/infra/db/repos/messageThreads.ts",
      "apps/integrator/src/infra/db/repos/platformUserByChannel.ts",
      "apps/integrator/src/infra/db/repos/platformUserDeliveryPhone.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/integrator/src/infra/operatorIncident/operatorHealthAlertConfigIntegrator.ts",
      "apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts",
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/integrator/src/integrations/google-calendar/calendarDescription.ts",
      "apps/integrator/src/integrations/webappEntryToken.ts",
      "apps/integrator/src/shared/devDeliveryRedirect.ts",
      "apps/integrator/src/shared/phoneLinkUserMessages.ts",
      "apps/webapp/src/app-layer/booking/resolveDoctorCalendarIana.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/guards/requireRole.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
      "apps/webapp/src/app/api/account/security/sessions/revoke/route.ts",
      "apps/webapp/src/app/api/auth/email-password/reset/route.ts",
      "apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/physical/route.ts",
      "apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.ts",
      "apps/webapp/src/app/app/doctor/clients/AdminClientProfileEditPanel.tsx",
      "apps/webapp/src/app/app/doctor/clients/DoctorClientPrimaryContacts.tsx",
      "apps/webapp/src/app/app/settings/AdminSettingsSection.tsx",
      "apps/webapp/src/config/env.ts",
      "apps/webapp/src/infra/adminAuditLog.ts",
      "apps/webapp/src/infra/db/bootProbe.ts",
      "apps/webapp/src/infra/integratorPlatformUserMerge.ts",
      "apps/webapp/src/infra/manualMergeIntegratorGate.ts",
      "apps/webapp/src/infra/mergeAuditLabels.ts",
      "apps/webapp/src/infra/mergePreviewIntegratorUserPresence.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/platformUserNameMatchHints.ts",
      "apps/webapp/src/infra/repos/broadcastChannelCounts.ts",
      "apps/webapp/src/infra/repos/identityPhoneRowSchemas.ts",
      "apps/webapp/src/infra/repos/inMemoryUserByPhone.ts",
      "apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts",
      "apps/webapp/src/infra/repos/pgAdminClientProfileConflicts.ts",
      "apps/webapp/src/infra/repos/pgAdminNotificationTargets.ts",
      "apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts",
      "apps/webapp/src/infra/repos/pgAnalyticsAudience.ts",
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgBroadcastEmailRecipients.ts",
      "apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkStart.ts",
      "apps/webapp/src/infra/repos/pgChannelPreferences.ts",
      "apps/webapp/src/infra/repos/pgClientMediaFolders.ts",
      "apps/webapp/src/infra/repos/pgDevBypassPlatformUserPhone.ts",
      "apps/webapp/src/infra/repos/pgDiaryPurge.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorCalendarTimezone.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClientCreate.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgEmailAuth.ts",
      "apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts",
      "apps/webapp/src/infra/repos/pgGlobalAdminWebPushRecipients.ts",
      "apps/webapp/src/infra/repos/pgHealthFailureArchive.ts",
      "apps/webapp/src/infra/repos/pgIdentityResolution.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgMaterialRating.ts",
      "apps/webapp/src/infra/repos/pgMaterialRatingFeedback.ts",
      "apps/webapp/src/infra/repos/pgOAuthUserResolve.ts",
      "apps/webapp/src/infra/repos/pgOrganizationInvites.ts",
      "apps/webapp/src/infra/repos/pgOrganizationMembership.ts",
      "apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
      "apps/webapp/src/infra/repos/pgPhoneHistory.ts",
      "apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts",
      "apps/webapp/src/infra/repos/pgPlatformAccess.ts",
      "apps/webapp/src/infra/repos/pgPlatformUserCalendarTimezone.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/infra/repos/pgPublicBookingMergeCandidates.ts",
      "apps/webapp/src/infra/repos/pgPublicBookingUserResolve.ts",
      "apps/webapp/src/infra/repos/pgReminderJournal.ts",
      "apps/webapp/src/infra/repos/pgReminderMessengerTopicDisable.ts",
      "apps/webapp/src/infra/repos/pgReminderProjection.ts",
      "apps/webapp/src/infra/repos/pgReminderRules.ts",
      "apps/webapp/src/infra/repos/pgReminderWebappNotifyGate.ts",
      "apps/webapp/src/infra/repos/pgStaffUsers.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "apps/webapp/src/infra/repos/pgUserByPhone.ts",
      "apps/webapp/src/infra/repos/pgUserProjection.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "apps/webapp/src/infra/repos/userContactsSql.ts",
      "apps/webapp/src/infra/repos/userIdentityFioSql.ts",
      "apps/webapp/src/infra/strictPlatformUserPurge.ts",
      "apps/webapp/src/instrumentation.ts",
      "apps/webapp/src/modules/auth/envRole.ts",
      "apps/webapp/src/modules/auth/identityResolutionPort.ts",
      "apps/webapp/src/modules/auth/passwordChange.ts",
      "apps/webapp/src/modules/auth/service.ts",
      "apps/webapp/src/modules/auth/sessionCanonicalUserIdPolicy.ts",
      "apps/webapp/src/modules/auth/sessionCookie.ts",
      "apps/webapp/src/modules/auth/sessionRevocationSchema.ts",
      "apps/webapp/src/modules/auth/userByPhonePort.ts",
      "apps/webapp/src/modules/channel-preferences/ports.ts",
      "apps/webapp/src/modules/diaries/loadPatientDiaryWeekWellbeing.ts",
      "apps/webapp/src/modules/doctor-calendar-timezone/doctorCalendarTimezone.ts",
      "apps/webapp/src/modules/doctor-clients/clientArchiveChange.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/identity/ports.ts",
      "apps/webapp/src/modules/integrator/events.ts",
      "apps/webapp/src/modules/messaging/patientMessagingService.ts",
      "apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts",
      "apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts",
      "apps/webapp/src/modules/platform-access/types.ts",
      "apps/webapp/src/modules/platform-user-contacts/bookingContactUpsert.ts",
      "apps/webapp/src/modules/platform-user-contacts/identityContactMatch.ts",
      "apps/webapp/src/modules/public-booking/publicBookingResponse.ts",
      "apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts",
      "apps/webapp/src/shared/platform-user/isPlatformUserUuid.ts",
      "apps/webapp/src/shared/types/session.ts",
      "packages/db-principal/src/index.ts",
      "packages/platform-merge/src/identityProjectionWrite.ts",
      "packages/platform-merge/src/mergeContactFallback.ts",
      "packages/platform-merge/src/messengerBindAuditEnrichment.ts",
      "packages/platform-merge/src/messengerPhonePublicBind.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts",
      "packages/platform-merge/src/phoneHistorySync.ts",
      "packages/platform-merge/src/userContactsMirrorWrite.ts",
      "packages/platform-merge/src/userIdentityFioWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "display_name",
          "email",
          "email_normalized",
          "email_verified_at",
          "first_name",
          "last_name",
          "patient_phone_trust_at",
          "patronymic",
          "phone_normalized",
          "role"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "birth_date",
          "blocked_at",
          "blocked_by",
          "blocked_reason",
          "calendar_timezone",
          "display_name",
          "email",
          "email_normalized",
          "email_verified_at",
          "gender",
          "integrator_user_id",
          "is_archived",
          "is_blocked",
          "merged_at",
          "merged_into_id",
          "patient_phone_trust_at",
          "phone_normalized",
          "reminder_muted_until",
          "role",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "phone_normalized",
          "patient_phone_trust_at",
          "integrator_user_id",
          "merged_into_id",
          "display_name",
          "first_name",
          "last_name",
          "patronymic",
          "email",
          "email_verified_at",
          "role",
          "created_at",
          "email_normalized",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "display_name",
          "email",
          "email_verified_at",
          "first_name",
          "id",
          "integrator_user_id",
          "last_name",
          "patient_phone_trust_at",
          "phone_normalized",
          "role"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "display_name",
          "email",
          "email_normalized",
          "first_name",
          "integrator_user_id",
          "last_name",
          "merged_at",
          "merged_into_id",
          "patient_phone_trust_at",
          "phone_normalized",
          "updated_at"
        ]
      }
    ]
  },
  "public.product_analytics_events_recent": {
    "kind": "direct",
    "purpose": "сырые события продукта — без неё нет продуктовой аналитики и воронки регистрации",
    "codePaths": [
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "client_session_id",
          "entry_channel",
          "event_type",
          "metadata",
          "occurred_at",
          "organization_id",
          "page_key",
          "push_kind",
          "push_tracking_id",
          "topic_code",
          "user_id",
          "warmup_slogan_key"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.product_analytics_hourly": {
    "kind": "direct",
    "purpose": "агрегат событий по часам (без человека) — без неё нет агрегированных графиков продукта",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "bucket_hour",
          "entry_channel",
          "event_count",
          "event_type",
          "organization_id",
          "page_key",
          "push_kind",
          "topic_code",
          "updated_at",
          "warmup_slogan_key"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "event_count",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.product_analytics_user_hourly": {
    "kind": "direct",
    "purpose": "почасовая активность человека — без неё врач не видит, заходит ли пациент в приложение",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "active_minutes",
          "app_opens",
          "bucket_hour",
          "entry_channel",
          "last_seen_at",
          "organization_id",
          "page_key",
          "page_views",
          "push_opens",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "active_minutes",
          "app_opens",
          "last_seen_at",
          "page_views",
          "push_opens",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "columns": [
          "active_minutes",
          "app_opens",
          "bucket_hour",
          "entry_channel",
          "last_seen_at",
          "organization_id",
          "page_key",
          "page_views",
          "push_opens",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "active_minutes",
          "app_opens",
          "last_seen_at",
          "page_views",
          "push_opens",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.product_push_notifications": {
    "kind": "direct",
    "purpose": "отправленные push’и — без неё нельзя связать открытие приложения с конкретным push’ем",
    "codePaths": [
      "apps/webapp/src/app-layer/product-analytics/createTrackedWebPushPayload.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts",
      "apps/webapp/src/modules/product-analytics/productAnalyticsTopicLabels.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "id",
          "intent_type",
          "occurrence_id",
          "open_url",
          "organization_id",
          "push_kind",
          "title",
          "topic_code",
          "user_id",
          "warmup_slogan_key",
          "warmup_slogan_text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      }
    ]
  },
  "public.program_action_log": {
    "kind": "direct",
    "purpose": "действия пациента по программе лечения — без неё врач не видит, что пациент делал по программе",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/exercise-calendar/route.ts",
      "apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts",
      "apps/webapp/src/app/app/doctor/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientExerciseCalendar.ts",
      "apps/webapp/src/app/app/patient/diary/PatientDiaryAuthenticatedMain.tsx",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgProgramActionLog.ts",
      "apps/webapp/src/modules/patient-diary/captureDiaryDaySnapshot.ts",
      "apps/webapp/src/modules/patient-diary/loadPatientDiaryWeekActivity.ts",
      "apps/webapp/src/modules/treatment-program/patient-program-actions.ts",
      "apps/webapp/src/modules/treatment-program/programActionActivityKey.ts",
      "apps/webapp/src/modules/treatment-program/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "action_type",
          "instance_id",
          "instance_stage_item_id",
          "note",
          "organization_id",
          "patient_user_id",
          "payload",
          "session_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "instance_id",
          "instance_stage_item_id",
          "patient_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.program_item_discussion_messages": {
    "kind": "direct",
    "purpose": "переписка врач↔пациент по пункту программы — без неё нет комментариев к упражнению — ключевой канал общения",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "body",
          "created_at",
          "instance_stage_item_id",
          "media_file_id",
          "organization_id",
          "origin",
          "patient_user_id",
          "sender_role",
          "support_message_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.program_item_discussion_reads": {
    "kind": "direct",
    "purpose": "отметки прочтения обсуждения — без неё счётчики непрочитанного врут",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "instance_stage_item_id",
          "last_read_at",
          "organization_id",
          "patient_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "last_read_at"
        ]
      }
    ]
  },
  "public.recommendation_regions": {
    "kind": "direct",
    "purpose": "связь рекомендация↔область тела — без неё не работают фильтры каталога по области тела",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgRecommendations.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "body_region_id",
          "organization_id",
          "recommendation_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.recommendations": {
    "kind": "direct",
    "purpose": "справочник рекомендаций клиники — без неё врачу нечего назначать",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/admin/media/[id]/usage-summary/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/visits/[visitId]/route.ts",
      "apps/webapp/src/app/api/doctor/patients/[userId]/visits/route.ts",
      "apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts",
      "apps/webapp/src/app/api/doctor/recommendations/route.ts",
      "apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/NewVisitPanel.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/VisitCatalogTextarea.tsx",
      "apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/visitCatalogText.ts",
      "apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx",
      "apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx",
      "apps/webapp/src/app/app/doctor/recommendations/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/recommendations/actions.ts",
      "apps/webapp/src/app/app/doctor/recommendations/actionsShared.ts",
      "apps/webapp/src/app/app/doctor/recommendations/new/page.tsx",
      "apps/webapp/src/app/app/doctor/recommendations/page.tsx",
      "apps/webapp/src/app/app/doctor/recommendations/paths.ts",
      "apps/webapp/src/app/app/doctor/recommendations/recommendationUsageDocLinks.ts",
      "apps/webapp/src/app/app/doctor/recommendations/recommendationUsageSummaryText.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/instanceEditorDraft.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/loadTreatmentProgramLibrary.ts",
      "apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupQuickList.tsx",
      "apps/webapp/src/app/app/patient/treatment/PatientProgramStageItemPageClient.tsx",
      "apps/webapp/src/app/app/patient/treatment/PatientStageCompositionList.tsx",
      "apps/webapp/src/app/app/patient/treatment/PatientTreatmentTabRecommendations.tsx",
      "apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionMessageBody.tsx",
      "apps/webapp/src/app/app/patient/treatment/patientPlanTab.ts",
      "apps/webapp/src/app/app/patient/treatment/program-detail/PatientPlanTabPanels.tsx",
      "apps/webapp/src/app/app/patient/treatment/program-detail/PatientPlanTabStrip.tsx",
      "apps/webapp/src/app/app/patient/treatment/stageItemSnapshot.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientClinical.ts",
      "apps/webapp/src/infra/repos/inMemoryRecommendations.ts",
      "apps/webapp/src/infra/repos/inMemoryTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/mockMediaStorage.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgPatientClinical.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/modules/media/types.ts",
      "apps/webapp/src/modules/media/usageSummaryFormat.ts",
      "apps/webapp/src/modules/patient-clinical/ports.ts",
      "apps/webapp/src/modules/patient-clinical/service.ts",
      "apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts",
      "apps/webapp/src/modules/recommendations/recommendationDomain.ts",
      "apps/webapp/src/modules/treatment-program/instance-service.ts",
      "apps/webapp/src/modules/treatment-program/instance-tree-system-groups.ts",
      "apps/webapp/src/modules/treatment-program/instanceEditorBatchApply.ts",
      "apps/webapp/src/modules/treatment-program/ports.ts",
      "apps/webapp/src/modules/treatment-program/stage-semantics.ts",
      "apps/webapp/src/modules/treatment-program/types.ts",
      "apps/webapp/src/shared/lib/doctorCatalogListStatus.ts",
      "apps/webapp/src/shared/lib/doctorCatalogViewPreference.ts",
      "apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts",
      "apps/webapp/src/shared/ui/doctor/media/DoctorCatalogMediaStaticThumb.tsx",
      "apps/webapp/src/shared/ui/doctor/media/mediaPreviewUiModel.ts",
      "apps/webapp/src/shared/ui/doctorScreenTitles.ts",
      "apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx",
      "apps/webapp/src/shared/ui/patient/media/mediaPreviewUiModel.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "body_md",
          "body_region_id",
          "created_by",
          "domain",
          "duration_text",
          "frequency_text",
          "media",
          "organization_id",
          "quantity_text",
          "tags",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "body_md",
          "domain",
          "duration_text",
          "frequency_text",
          "is_archived",
          "media",
          "organization_id",
          "quantity_text",
          "tags",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.reference_categories": {
    "kind": "direct",
    "purpose": "категории справочников клиники — без неё пусты все выпадающие списки каталогов",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgReferences.ts",
      "apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts",
      "apps/webapp/src/modules/recommendations/recommendationDomain.ts",
      "apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      }
    ]
  },
  "public.reference_items": {
    "kind": "direct",
    "purpose": "элементы справочников клиники — без них выпадающие списки каталогов пусты",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/clinical-tests/route.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts",
      "apps/webapp/src/infra/repos/pgReferences.ts",
      "apps/webapp/src/modules/lfk-exercises/exerciseLoadTypeReference.ts",
      "apps/webapp/src/modules/lfk-exercises/types.ts",
      "apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts",
      "apps/webapp/src/modules/recommendations/recommendationDomain.ts",
      "apps/webapp/src/modules/recommendations/types.ts",
      "apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts",
      "apps/webapp/src/modules/tests/types.ts",
      "apps/webapp/src/shared/lib/doctorCatalogRegionQuery.ts",
      "apps/webapp/src/shared/lib/mergeCatalogBodyRegionIds.ts",
      "apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx",
      "apps/webapp/src/shared/ui/doctor/ReferenceMultiSelect.tsx"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "category_id",
          "code",
          "is_active",
          "meta_json",
          "organization_id",
          "sort_order",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "code",
          "deleted_at",
          "is_active",
          "organization_id",
          "sort_order",
          "title"
        ]
      }
    ]
  },
  "public.reminder_delivery_events": {
    "kind": "direct",
    "purpose": "события доставки напоминаний из интегратора — без неё не видно, дошло ли напоминание, и не считается здоровье конвейера",
    "codePaths": [
      "apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgReminderProjection.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel",
          "created_at",
          "error_code",
          "integrator_delivery_log_id",
          "integrator_occurrence_id",
          "integrator_rule_id",
          "integrator_user_id",
          "payload_json",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "integrator_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.reminder_journal": {
    "kind": "direct",
    "purpose": "действия пациента с напоминанием — без неё пациент не видит истории «отложил/пропустил»",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/app/patient/reminders/RemindersPageBody.tsx",
      "apps/webapp/src/app/app/patient/reminders/journal/[ruleId]/page.tsx",
      "apps/webapp/src/infra/repos/pgReminderJournal.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "action",
          "occurrence_id",
          "rule_id",
          "skip_reason",
          "snooze_until"
        ]
      }
    ]
  },
  "public.reminder_occurrence_history": {
    "kind": "direct",
    "purpose": "история срабатываний напоминаний: подписанный tenant-scoped integrator event добавляет проекцию, человек только читает или обслуживает её",
    "codePaths": [
      "apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/inMemoryReminderJournal.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgReminderJournal.ts",
      "apps/webapp/src/infra/repos/pgReminderMessengerTopicDisable.ts",
      "apps/webapp/src/infra/repos/pgReminderProjection.ts",
      "apps/webapp/src/infra/repos/pgReminderRules.ts",
      "apps/webapp/src/modules/reminders/reminderJournalPort.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "integrator_user_id",
          "seen_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.reminder_rules": {
    "kind": "direct",
    "purpose": "правила напоминаний пациенту — без неё пациент перестаёт получать напоминания",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts",
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/migrations/core/20260808_0002_drop_legacy_user_reminder_rules.sql",
      "apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts",
      "apps/integrator/src/infra/db/repos/reminders.ts",
      "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/integrator/src/infra/runtime/scheduler/schedulerDecisionGuard.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/inMemoryReminderRules.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts",
      "apps/webapp/src/infra/repos/pgReminderJournal.ts",
      "apps/webapp/src/infra/repos/pgReminderMessengerTopicDisable.ts",
      "apps/webapp/src/infra/repos/pgReminderProjection.ts",
      "apps/webapp/src/infra/repos/pgReminderRules.ts",
      "apps/webapp/src/modules/reminders/notificationTopicCode.ts",
      "apps/webapp/src/modules/reminders/ports.ts",
      "apps/webapp/src/modules/reminders/scheduleSlots.ts",
      "apps/webapp/src/modules/reminders/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "category",
          "content_mode",
          "custom_text",
          "custom_title",
          "days_mask",
          "display_description",
          "display_title",
          "integrator_rule_id",
          "integrator_user_id",
          "interval_minutes",
          "is_enabled",
          "linked_object_id",
          "linked_object_type",
          "notification_topic_code",
          "organization_id",
          "platform_user_id",
          "quiet_hours_end_minute",
          "quiet_hours_start_minute",
          "reminder_intent",
          "schedule_data",
          "schedule_type",
          "timezone",
          "updated_at",
          "window_end_minute",
          "window_start_minute"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "category",
          "content_mode",
          "custom_text",
          "custom_title",
          "days_mask",
          "display_description",
          "display_title",
          "integrator_user_id",
          "interval_minutes",
          "is_enabled",
          "linked_object_id",
          "platform_user_id",
          "quiet_hours_end_minute",
          "quiet_hours_start_minute",
          "schedule_data",
          "schedule_type",
          "timezone",
          "updated_at",
          "window_end_minute",
          "window_start_minute"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "category",
          "content_mode",
          "custom_text",
          "custom_title",
          "days_mask",
          "id",
          "integrator_rule_id",
          "integrator_user_id",
          "interval_minutes",
          "is_enabled",
          "linked_object_id",
          "linked_object_type",
          "notification_topic_code",
          "organization_id",
          "platform_user_id",
          "quiet_hours_end_minute",
          "quiet_hours_start_minute",
          "reminder_intent",
          "schedule_data",
          "schedule_type",
          "timezone",
          "updated_at",
          "window_end_minute",
          "window_start_minute"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "category",
          "content_mode",
          "custom_text",
          "custom_title",
          "days_mask",
          "integrator_rule_id",
          "integrator_user_id",
          "interval_minutes",
          "is_enabled",
          "linked_object_id",
          "linked_object_type",
          "notification_topic_code",
          "organization_id",
          "platform_user_id",
          "quiet_hours_end_minute",
          "quiet_hours_start_minute",
          "reminder_intent",
          "schedule_data",
          "schedule_type",
          "timezone",
          "updated_at",
          "window_end_minute",
          "window_start_minute"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "category",
          "content_mode",
          "custom_text",
          "custom_title",
          "days_mask",
          "integrator_user_id",
          "interval_minutes",
          "is_enabled",
          "linked_object_id",
          "linked_object_type",
          "notification_topic_code",
          "organization_id",
          "platform_user_id",
          "quiet_hours_end_minute",
          "quiet_hours_start_minute",
          "reminder_intent",
          "schedule_data",
          "schedule_type",
          "timezone",
          "updated_at",
          "window_end_minute",
          "window_start_minute"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.saas_billing_accounts": {
    "kind": "direct",
    "purpose": "платёжный профиль клиники — без неё клиника не выставит счёт",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgSaasBilling.ts"
    ],
    "grants": [
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "billing_email",
          "organization_id"
        ]
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "billing_email",
          "updated_at"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "billing_email",
          "organization_id"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "billing_email",
          "updated_at"
        ]
      }
    ]
  },
  "public.saas_billing_invoices": {
    "kind": "direct",
    "purpose": "счета — оплата подписки",
    "codePaths": [
      "apps/webapp/src/app/api/admin/saas-billing/payments/route.ts",
      "apps/webapp/src/app/app/admin/payments/PlatformPaymentsSection.tsx",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts",
      "apps/webapp/src/modules/saas-billing/ports.ts"
    ],
    "grants": [
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "additional_seat_quantity",
          "amount_minor",
          "currency",
          "description",
          "expires_at",
          "invoice_kind",
          "organization_id",
          "provider_id",
          "provider_idempotency_key",
          "saas_billing_account_id",
          "saas_billing_subscription_id",
          "service_period_ends_at",
          "service_period_starts_at",
          "status",
          "tariff_billing_period",
          "tariff_id",
          "tariff_name",
          "tariff_snapshot"
        ]
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "currency",
          "paid_at",
          "provider_checkout_url",
          "provider_id",
          "provider_idempotency_key",
          "provider_invoice_ref",
          "status",
          "tariff_billing_period",
          "tariff_id",
          "tariff_name",
          "tariff_snapshot",
          "updated_at"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_worker",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "currency",
          "paid_at",
          "status",
          "tariff_billing_period",
          "tariff_id",
          "tariff_name",
          "tariff_snapshot",
          "updated_at"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "additional_seat_quantity",
          "amount_minor",
          "currency",
          "description",
          "expires_at",
          "invoice_kind",
          "organization_id",
          "provider_id",
          "provider_idempotency_key",
          "saas_billing_account_id",
          "saas_billing_subscription_id",
          "service_period_ends_at",
          "service_period_starts_at",
          "status",
          "tariff_billing_period",
          "tariff_id",
          "tariff_name",
          "tariff_snapshot"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "currency",
          "paid_at",
          "provider_checkout_url",
          "provider_id",
          "provider_idempotency_key",
          "provider_invoice_ref",
          "status",
          "tariff_billing_period",
          "tariff_id",
          "tariff_name",
          "tariff_snapshot",
          "updated_at"
        ]
      }
    ]
  },
  "public.saas_billing_provider_events": {
    "kind": "direct",
    "purpose": "вебхуки провайдера — идемпотентность оплаты",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgSaasBilling.ts"
    ],
    "grants": [
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "organization_id",
          "saas_billing_invoice_id",
          "provider_id",
          "provider_event_id",
          "event_type",
          "processed_at",
          "created_at"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_worker",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "event_type",
          "organization_id",
          "provider_event_id",
          "provider_id",
          "raw_payload",
          "saas_billing_invoice_id"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "processed_at"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "event_type",
          "organization_id",
          "provider_event_id",
          "provider_id",
          "raw_payload",
          "saas_billing_invoice_id"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "processed_at"
        ]
      }
    ]
  },
  "public.saas_billing_refunds": {
    "kind": "direct",
    "purpose": "возвраты — возврат денег клинике",
    "codePaths": [
      "apps/webapp/src/app/api/payments/saas-webhook/[provider]/route.ts",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts"
    ],
    "grants": [
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "currency",
          "organization_id",
          "provider_id",
          "provider_idempotency_key",
          "saas_billing_invoice_id",
          "status"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "confirmed_at",
          "provider_refund_ref",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_worker",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "amount_minor",
          "currency",
          "organization_id",
          "provider_id",
          "provider_idempotency_key",
          "saas_billing_invoice_id",
          "status"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "confirmed_at",
          "provider_refund_ref",
          "status",
          "updated_at"
        ]
      }
    ]
  },
  "public.saas_billing_subscriptions": {
    "kind": "direct",
    "purpose": "подписка клиники — доступ клиники к продукту",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgOrgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts",
      "apps/webapp/src/infra/repos/transactionQuotaPort.ts",
      "apps/webapp/src/modules/saas-billing/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "organization_id",
          "status",
          "current_period_ends_at",
          "paid_additional_seats",
          "source"
        ]
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "current_period_ends_at",
          "current_period_starts_at",
          "lifecycle_state",
          "organization_id",
          "pending_tariff_id",
          "saas_billing_account_id",
          "source",
          "status",
          "tariff_id",
          "tariff_snapshot"
        ]
      },
      {
        "role": "app_clinic_billing",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "autopay_consent_text",
          "autopay_consented_at",
          "autopay_revoked_at",
          "cancelled_at",
          "current_period_ends_at",
          "current_period_starts_at",
          "lifecycle_state",
          "paid_additional_seats",
          "pending_tariff_id",
          "saved_payment_method_id",
          "status",
          "tariff_id",
          "tariff_snapshot",
          "updated_at"
        ]
      },
      {
        "role": "app_worker",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_worker",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "cancelled_at",
          "current_period_ends_at",
          "current_period_starts_at",
          "lifecycle_state",
          "paid_additional_seats",
          "pending_tariff_id",
          "saved_payment_method_id",
          "status",
          "tariff_id",
          "tariff_snapshot",
          "updated_at"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "current_period_ends_at",
          "current_period_starts_at",
          "lifecycle_state",
          "organization_id",
          "pending_tariff_id",
          "saas_billing_account_id",
          "source",
          "status",
          "tariff_id",
          "tariff_snapshot"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "autopay_consent_text",
          "autopay_consented_at",
          "autopay_revoked_at",
          "cancelled_at",
          "current_period_ends_at",
          "current_period_starts_at",
          "lifecycle_state",
          "paid_additional_seats",
          "pending_tariff_id",
          "saved_payment_method_id",
          "status",
          "tariff_id",
          "tariff_snapshot",
          "updated_at"
        ]
      }
    ]
  },
  "public.saas_tariffs": {
    "kind": "direct",
    "purpose": "клиника читает глобальный тарифный каталог для выбора и оплаты; webhook worker читает ценовой снимок; изменяет каталог только платформа",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts"
    ],
    "grants": [
      {
        "role": "app_clinic_billing",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_worker",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "additional_seat_price_minor",
          "billing_period",
          "currency",
          "description",
          "discounted_price_minor",
          "downgrade_policies",
          "included_seats",
          "is_active",
          "mailing_templates",
          "mechanic_access_policies",
          "mechanics",
          "name",
          "price_minor",
          "quotas",
          "system_access_policy"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "additional_seat_price_minor",
          "billing_period",
          "currency",
          "description",
          "discounted_price_minor",
          "downgrade_policies",
          "included_seats",
          "is_active",
          "mailing_templates",
          "mechanic_access_policies",
          "mechanics",
          "name",
          "price_minor",
          "quotas",
          "system_access_policy",
          "updated_at"
        ]
      },
      {
        "role": "app_platform_settings",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.saas_org_entitlement_overrides": {
    "kind": "direct",
    "purpose": "ручные включения механик клинике — точечная выдача функций клинике",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgOrgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/infra/repos/transactionQuotaPort.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT",
          "UPDATE"
        ],
        "columns": [
          "enabled",
          "expires_at",
          "mechanic",
          "organization_id",
          "quota",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.saas_organization_trials": {
    "kind": "direct",
    "purpose": "триал клиники — бесплатный период",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgOrgEntitlements.ts",
      "apps/webapp/src/infra/repos/pgPlatformEntitlements.ts",
      "apps/webapp/src/infra/repos/pgSaasBilling.ts",
      "apps/webapp/src/modules/saas-billing/ports.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "discount_ends_at",
          "ends_at",
          "organization_id",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "started_at",
          "tariff_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "status",
          "updated_at"
        ]
      }
    ]
  },
  "public.specialist_tasks": {
    "kind": "direct",
    "purpose": "задачи врача по пациенту — пропадёт список задач врача и напоминания по ним",
    "codePaths": [
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/operator-health/recordOperatorCronJobTick.ts",
      "apps/webapp/src/app/api/doctor/clients/[userId]/tasks/route.ts",
      "apps/webapp/src/app/api/doctor/clients/[userId]/tasks/summary/route.ts",
      "apps/webapp/src/app/api/doctor/tasks/[taskId]/complete/route.ts",
      "apps/webapp/src/app/api/doctor/tasks/[taskId]/route.ts",
      "apps/webapp/src/app/api/doctor/tasks/route.ts",
      "apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts",
      "apps/webapp/src/app/app/doctor/clients/loadDoctorClientProfileCardProps.ts",
      "apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts",
      "apps/webapp/src/app/app/doctor/page.tsx",
      "apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts",
      "apps/webapp/src/infra/repos/pgSpecialistTasks.ts",
      "apps/webapp/src/modules/operator-health/reconcileJobKeys.ts",
      "apps/webapp/src/modules/org-entitlements/types.ts",
      "apps/webapp/src/modules/specialist-tasks/dispatchDueReminders.ts",
      "apps/webapp/src/modules/specialist-tasks/service.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "due_at",
          "is_important",
          "organization_id",
          "owner_user_id",
          "patient_user_id",
          "remind_at",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "completed_at",
          "description",
          "due_at",
          "is_important",
          "organization_id",
          "reminder_sent_at",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "organization_id",
          "owner_user_id",
          "remind_at",
          "reminder_sent_at",
          "title"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "id",
          "organization_id",
          "owner_user_id",
          "remind_at",
          "title"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "reminder_sent_at"
        ]
      }
    ]
  },
  "public.support_conversation_messages": {
    "kind": "direct",
    "purpose": "сообщения диалога — тело переписки",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts",
      "apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts",
      "apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "conversation_id",
          "created_at",
          "delivered_at",
          "delivery_status",
          "external_chat_id",
          "external_message_id",
          "integrator_message_id",
          "media_type",
          "media_url",
          "message_type",
          "organization_id",
          "sender_role",
          "source",
          "text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "conversation_id",
          "read_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "conversation_id",
          "created_at",
          "external_chat_id",
          "external_message_id",
          "id",
          "integrator_message_id",
          "message_type",
          "organization_id",
          "sender_role",
          "source",
          "text"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "conversation_id",
          "created_at",
          "external_chat_id",
          "external_message_id",
          "integrator_message_id",
          "message_type",
          "organization_id",
          "sender_role",
          "source",
          "text"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "conversation_id"
        ]
      }
    ]
  },
  "public.support_conversations": {
    "kind": "direct",
    "purpose": "диалоги поддержки — без неё нет переписки врач↔пациент",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/messaging/ports.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "admin_scope",
          "channel_code",
          "channel_external_id",
          "close_reason",
          "closed_at",
          "integrator_conversation_id",
          "integrator_user_id",
          "last_message_at",
          "opened_at",
          "organization_id",
          "platform_user_id",
          "source",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "close_reason",
          "closed_at",
          "integrator_user_id",
          "last_message_at",
          "organization_id",
          "platform_user_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "admin_scope",
          "channel_code",
          "channel_external_id",
          "close_reason",
          "closed_at",
          "id",
          "integrator_conversation_id",
          "last_message_at",
          "opened_at",
          "organization_id",
          "platform_user_id",
          "source",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "admin_scope",
          "channel_code",
          "channel_external_id",
          "integrator_conversation_id",
          "last_message_at",
          "opened_at",
          "organization_id",
          "platform_user_id",
          "source",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "close_reason",
          "closed_at",
          "last_message_at",
          "organization_id",
          "platform_user_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.support_delivery_events": {
    "kind": "direct",
    "purpose": "журнал доставки сообщений — без него не видно, дошло ли сообщение",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "attempt",
          "channel_code",
          "conversation_message_id",
          "correlation_id",
          "integrator_intent_event_id",
          "occurred_at",
          "organization_id",
          "payload_json",
          "reason",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "attempt",
          "channel_code",
          "conversation_message_id",
          "correlation_id",
          "id",
          "integrator_intent_event_id",
          "occurred_at",
          "organization_id",
          "payload_json",
          "reason",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "attempt",
          "channel_code",
          "conversation_message_id",
          "correlation_id",
          "integrator_intent_event_id",
          "occurred_at",
          "organization_id",
          "payload_json",
          "reason",
          "status"
        ]
      }
    ]
  },
  "public.support_question_messages": {
    "kind": "direct",
    "purpose": "реплики внутри вопроса — тело вопроса",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "integrator_question_message_id",
          "organization_id",
          "question_id",
          "sender_role",
          "text"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "created_at",
          "id",
          "integrator_question_message_id",
          "organization_id",
          "question_id",
          "sender_role",
          "text"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_at",
          "integrator_question_message_id",
          "organization_id",
          "question_id",
          "sender_role",
          "text"
        ]
      }
    ]
  },
  "public.support_questions": {
    "kind": "direct",
    "purpose": "вопросы пациента из бота — очередь «вопрос из мессенджера → врач»",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts",
      "apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "answered_at",
          "conversation_id",
          "created_at",
          "integrator_question_id",
          "organization_id",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "answered_at",
          "conversation_id",
          "organization_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "answered_at",
          "conversation_id",
          "created_at",
          "id",
          "integrator_question_id",
          "organization_id",
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "answered_at",
          "conversation_id",
          "created_at",
          "integrator_question_id",
          "organization_id",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "answered_at",
          "conversation_id",
          "organization_id",
          "status",
          "updated_at"
        ]
      }
    ]
  },
  "public.symptom_entries": {
    "kind": "direct",
    "purpose": "замеры — динамика самочувствия",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgSymptomDiary.ts",
      "apps/webapp/src/infra/repos/pgWarmupFeelingCompletion.ts",
      "apps/webapp/src/modules/diaries/wellbeingGeneralMirrorNote.ts",
      "apps/webapp/src/modules/patient-mood/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "entry_type",
          "notes",
          "patient_practice_completion_id",
          "platform_user_id",
          "recorded_at",
          "source",
          "tracking_id",
          "user_id",
          "value_0_10"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "entry_type",
          "notes",
          "recorded_at",
          "value_0_10"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id",
          "tracking_id",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.symptom_trackings": {
    "kind": "direct",
    "purpose": "что пациент отслеживает — дневник симптомов",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/DoctorClientRecordsTab.tsx",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/clients/loadDoctorClientProfileCardProps.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgDiaryPurge.ts",
      "apps/webapp/src/infra/repos/pgSymptomDiary.ts",
      "apps/webapp/src/infra/repos/warmupFeelingTrackingTx.ts",
      "apps/webapp/src/modules/doctor-clients/service.ts",
      "apps/webapp/src/modules/patient-mood/wellbeingConstants.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "diagnosis_ref_id",
          "diagnosis_text",
          "is_active",
          "organization_id",
          "platform_user_id",
          "region_ref_id",
          "side",
          "stage_ref_id",
          "symptom_key",
          "symptom_title",
          "symptom_type_ref_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "deleted_at",
          "is_active",
          "symptom_title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "created_at",
          "deleted_at",
          "id",
          "is_active",
          "platform_user_id",
          "symptom_key",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "deleted_at",
          "is_active",
          "platform_user_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.test_attempts": {
    "kind": "direct",
    "purpose": "попытки прохождения теста — пациент не сможет сдать тест",
    "codePaths": [
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "packages/platform-merge/src/mergeFailureClassification.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "accepted_at",
          "accepted_by",
          "submitted_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "instance_stage_item_id",
          "patient_user_id",
          "submitted_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "patient_user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "instance_stage_item_id",
          "organization_id",
          "patient_user_id"
        ]
      }
    ]
  },
  "public.test_results": {
    "kind": "direct",
    "purpose": "результат попытки — оценка теста",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "apps/webapp/src/modules/tests/types.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "attempt_id",
          "decided_by",
          "normalized_decision",
          "organization_id",
          "raw_value",
          "test_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "decided_by",
          "normalized_decision",
          "raw_value"
        ]
      }
    ]
  },
  "public.test_set_items": {
    "kind": "direct",
    "purpose": "состав набора — наполнение набора",
    "codePaths": [
      "apps/webapp/src/app/api/doctor/test-sets/[id]/items/route.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "organization_id",
          "sort_order",
          "test_id",
          "test_set_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.test_sets": {
    "kind": "direct",
    "purpose": "наборы тестов — пакетное назначение тестов",
    "codePaths": [
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app/api/doctor/test-sets/[id]/items/route.ts",
      "apps/webapp/src/app/api/doctor/test-sets/[id]/route.ts",
      "apps/webapp/src/app/api/doctor/test-sets/route.ts",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/actions.ts",
      "apps/webapp/src/app/app/doctor/test-sets/actionsShared.ts",
      "apps/webapp/src/app/app/doctor/test-sets/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/loadTreatmentProgramLibrary.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "description",
          "organization_id",
          "publication_status",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "is_archived",
          "organization_id",
          "publication_status",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.tests": {
    "kind": "direct",
    "purpose": "каталог клинических тестов клиники — без него врач не назначит тест",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts",
      "apps/integrator/src/infra/db/messengerStaffIds.ts",
      "apps/integrator/src/infra/db/pgAdvisoryLock.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/integrator/src/integrations/max/webhook.ts",
      "apps/integrator/src/integrations/telegram/webhook.ts",
      "apps/integrator/src/kernel/domain/usecases/handleUpdate.ts",
      "apps/integrator/src/kernel/domain/usecases/requestContactFlow.ts",
      "apps/integrator/src/shared/devDeliveryRedirect.ts",
      "apps/webapp/src/app-layer/di/buildAppDeps.ts",
      "apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts",
      "apps/webapp/src/app-layer/principal/bootstrapPrincipal.ts",
      "apps/webapp/src/app-layer/reminders/warmupSlugCache.ts",
      "apps/webapp/src/app-layer/routes/paths.ts",
      "apps/webapp/src/app-layer/testing/builders.ts",
      "apps/webapp/src/app/api/admin/media/[id]/usage-summary/route.ts",
      "apps/webapp/src/app/api/doctor/clinical-tests/[id]/route.ts",
      "apps/webapp/src/app/api/doctor/clinical-tests/route.ts",
      "apps/webapp/src/app/api/doctor/pending-program-tests/summary/route.ts",
      "apps/webapp/src/app/api/doctor/test-sets/[id]/items/route.ts",
      "apps/webapp/src/app/api/doctor/test-sets/[id]/route.ts",
      "apps/webapp/src/app/api/integrator/testUtils/wireAssertIntegratorGetForRouteTests.ts",
      "apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx",
      "apps/webapp/src/app/app/doctor/clients/DoctorClientProgramTab.tsx",
      "apps/webapp/src/app/app/doctor/clients/PatientActionStrip.tsx",
      "apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx",
      "apps/webapp/src/app/app/doctor/clients/doctorClientProfileHref.testFixtures.ts",
      "apps/webapp/src/app/app/doctor/clients/doctorClientProfileHref.ts",
      "apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestMeasureRowsEditor.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/actions.ts",
      "apps/webapp/src/app/app/doctor/clinical-tests/actionsShared.ts",
      "apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageDocLinks.ts",
      "apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageSummaryText.ts",
      "apps/webapp/src/app/app/doctor/clinical-tests/new/page.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/page.tsx",
      "apps/webapp/src/app/app/doctor/clinical-tests/paths.ts",
      "apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx",
      "apps/webapp/src/app/app/doctor/references/measure-kinds/MeasureKindsTableClient.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/TestSetItemsForm.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/TestSetMasterListStatusBadge.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/actions.ts",
      "apps/webapp/src/app/app/doctor/test-sets/actionsShared.ts",
      "apps/webapp/src/app/app/doctor/test-sets/clinicalTestLibraryRows.ts",
      "apps/webapp/src/app/app/doctor/test-sets/new/page.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/page.tsx",
      "apps/webapp/src/app/app/doctor/test-sets/testSetUsageDocLinks.ts",
      "apps/webapp/src/app/app/doctor/test-sets/testSetUsageSummaryText.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/instanceEditorDraft.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramConstructorShellStyles.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryDraftSnapshot.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers.ts",
      "apps/webapp/src/app/app/doctor/treatment-program-templates/loadTreatmentProgramLibrary.ts",
      "apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx",
      "apps/webapp/src/app/app/patient/treatment/PatientProgramStageItemPageClient.tsx",
      "apps/webapp/src/app/app/patient/treatment/PatientTestSetProgressForm.tsx",
      "apps/webapp/src/app/app/patient/treatment/[instanceId]/item/[itemId]/page.tsx",
      "apps/webapp/src/app/app/patient/treatment/patientProgramItemPageResolve.ts",
      "apps/webapp/src/app/app/patient/treatment/program-detail/PatientTreatmentProgramDetailClient.tsx",
      "apps/webapp/src/app/app/patient/treatment/stageItemSnapshot.ts",
      "apps/webapp/src/config/env.ts",
      "apps/webapp/src/infra/idempotency/index.ts",
      "apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/reconcilePersonDomain.ts",
      "apps/webapp/src/infra/repos/identityPhoneSql.ts",
      "apps/webapp/src/infra/repos/inMemoryBroadcastRecipients.ts",
      "apps/webapp/src/infra/repos/inMemoryClinicalTestMeasureKinds.ts",
      "apps/webapp/src/infra/repos/inMemoryClinicalTests.ts",
      "apps/webapp/src/infra/repos/inMemoryOperatorHealthWrite.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientClinical.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientComorbidities.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientFiles.ts",
      "apps/webapp/src/infra/repos/inMemoryPatientPayments.ts",
      "apps/webapp/src/infra/repos/inMemoryReferences.ts",
      "apps/webapp/src/infra/repos/inMemoryReminderJournal.ts",
      "apps/webapp/src/infra/repos/inMemoryTestSets.ts",
      "apps/webapp/src/infra/repos/inMemoryTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/inMemoryUserByPhone.ts",
      "apps/webapp/src/infra/repos/lfkDiary.ts",
      "apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts",
      "apps/webapp/src/infra/repos/mockMediaStorage.ts",
      "apps/webapp/src/infra/repos/pgClinicalTestMeasureKinds.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgEmailOtpPublic.ts",
      "apps/webapp/src/infra/repos/pgMediaUsageSummary.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "apps/webapp/src/infra/repos/symptomDiary.ts",
      "apps/webapp/src/infra/webhooks/verifyIntegratorSignature.ts",
      "apps/webapp/src/modules/auth/channelLink.ts",
      "apps/webapp/src/modules/auth/emailSetupAccess/noopPort.ts",
      "apps/webapp/src/modules/auth/service.ts",
      "apps/webapp/src/modules/auth/sessionCanonicalUserIdPolicy.ts",
      "apps/webapp/src/modules/doctor-client-card/types.ts",
      "apps/webapp/src/modules/doctor-clients/patientProgramInteractionPolicyTestMock.ts",
      "apps/webapp/src/modules/doctor-notifications/resolveDoctorNotificationChannels.ts",
      "apps/webapp/src/modules/media/types.ts",
      "apps/webapp/src/modules/media/usageSummaryFormat.ts",
      "apps/webapp/src/modules/operator-health/classifyOperatorCronJobHealthStatus.ts",
      "apps/webapp/src/modules/org-entitlements/ladderConstants.ts",
      "apps/webapp/src/modules/tests/clinicalTestAssessmentKind.ts",
      "apps/webapp/src/modules/tests/clinicalTestScoring.ts",
      "apps/webapp/src/modules/tests/types.ts",
      "apps/webapp/src/modules/treatment-program/clinicalTestSnapshotTitle.ts",
      "apps/webapp/src/modules/treatment-program/editorDraftSnapshotDetect.ts",
      "apps/webapp/src/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount.ts",
      "apps/webapp/src/modules/treatment-program/instance-service.ts",
      "apps/webapp/src/modules/treatment-program/instance-tree-system-groups.ts",
      "apps/webapp/src/modules/treatment-program/instanceEditorBatchApply.ts",
      "apps/webapp/src/modules/treatment-program/progress-service.ts",
      "apps/webapp/src/modules/treatment-program/stage-semantics.ts",
      "apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts",
      "apps/webapp/src/modules/treatment-program/types.ts",
      "apps/webapp/src/shared/lib/doctorCatalogListStatus.ts",
      "apps/webapp/src/shared/lib/doctorCatalogViewPreference.ts",
      "apps/webapp/src/shared/lib/nativeHls.ts",
      "apps/webapp/src/shared/lib/reloadDenylist.ts",
      "apps/webapp/src/shared/lib/webPush/subscribePatientWebPush.ts",
      "apps/webapp/src/shared/lib/webPush/subscribeStaffWebPush.ts",
      "apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts",
      "apps/webapp/src/shared/ui/doctor/media/doctorHlsQuality.ts",
      "apps/webapp/src/shared/ui/doctor/media/mediaPreviewUiModel.ts",
      "apps/webapp/src/shared/ui/doctor/media/useMediaLibraryPickerItems.ts",
      "apps/webapp/src/shared/ui/doctor/platformNavLinks.ts",
      "apps/webapp/src/shared/ui/doctorScreenTitles.ts",
      "apps/webapp/src/shared/ui/patient/media/mediaPreviewUiModel.ts",
      "apps/webapp/src/shared/ui/patient/media/patientHlsQuality.ts",
      "packages/platform-merge/src/identityProjectionWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "assessment_kind",
          "body_region_id",
          "created_by",
          "description",
          "media",
          "organization_id",
          "raw_text",
          "scoring",
          "tags",
          "test_type",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "assessment_kind",
          "description",
          "is_archived",
          "media",
          "organization_id",
          "raw_text",
          "scoring",
          "tags",
          "test_type",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "assessment_kind",
          "body_region_id",
          "created_by",
          "description",
          "media",
          "organization_id",
          "raw_text",
          "scoring",
          "tags",
          "test_type",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "assessment_kind",
          "description",
          "is_archived",
          "media",
          "organization_id",
          "raw_text",
          "scoring",
          "tags",
          "test_type",
          "title",
          "updated_at"
        ]
      }
    ]
  },
  "public.treatment_program_events": {
    "kind": "direct",
    "purpose": "журнал изменений программы — аудит «кто что менял в лечении»",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgTreatmentProgramEvents.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/modules/treatment-program/types.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "event_type",
          "instance_id",
          "organization_id",
          "payload",
          "reason",
          "target_id",
          "target_type"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "actor_id",
          "event_type",
          "instance_id",
          "organization_id",
          "payload",
          "reason",
          "target_id",
          "target_type"
        ]
      }
    ]
  },
  "public.treatment_program_instance_stage_groups": {
    "kind": "direct",
    "purpose": "группы внутри этапа — группировка заданий",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "organization_id",
          "schedule_text",
          "sort_order",
          "source_group_id",
          "stage_id",
          "system_kind",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "schedule_text",
          "sort_order"
        ]
      }
    ]
  },
  "public.treatment_program_instance_stage_items": {
    "kind": "direct",
    "purpose": "сами задания — что пациент делает каждый день",
    "codePaths": [
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgPlatformLfkMediaAccess.ts",
      "apps/webapp/src/infra/repos/pgProgramActionLog.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgProgramNoteReplyContext.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "completed_at",
          "created_at",
          "group_id",
          "is_actionable",
          "item_ref_id",
          "item_type",
          "last_viewed_at",
          "local_comment",
          "organization_id",
          "settings",
          "snapshot",
          "sort_order",
          "stage_id",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "comment",
          "completed_at",
          "created_at",
          "group_id",
          "is_actionable",
          "item_ref_id",
          "item_type",
          "last_viewed_at",
          "local_comment",
          "settings",
          "snapshot",
          "sort_order",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "completed_at",
          "id",
          "item_ref_id",
          "item_type",
          "last_viewed_at",
          "sort_order",
          "stage_id",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "completed_at",
          "last_viewed_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.treatment_program_instance_stages": {
    "kind": "direct",
    "purpose": "этапы программы — шаги лечения",
    "codePaths": [
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgPlatformLfkMediaAccess.ts",
      "apps/webapp/src/infra/repos/pgProgramActionLog.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgProgramNoteReplyContext.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "goals",
          "objectives",
          "skip_reason",
          "sort_order",
          "started_at",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "instance_id",
          "sort_order",
          "source_stage_id",
          "started_at",
          "status"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "started_at",
          "status"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "expected_duration_days",
          "expected_duration_text",
          "goals",
          "instance_id",
          "local_comment",
          "objectives",
          "organization_id",
          "skip_reason",
          "sort_order",
          "source_stage_id",
          "started_at",
          "status",
          "title"
        ]
      }
    ]
  },
  "public.treatment_program_instances": {
    "kind": "direct",
    "purpose": "назначенная пациенту программа — ядро лечения — без неё нет программы",
    "codePaths": [
      "apps/integrator/src/integrations/google-calendar/calendarDescription.ts",
      "apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts",
      "apps/webapp/src/app/api/patient/courses/route.ts",
      "apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts",
      "apps/webapp/src/app/app/doctor/clients/loadDoctorClientProfileCardProps.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/inMemoryCourses.ts",
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgCourses.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgPlatformLfkMediaAccess.ts",
      "apps/webapp/src/infra/repos/pgProgramActionLog.ts",
      "apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts",
      "apps/webapp/src/infra/repos/pgProgramNoteReplyContext.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramEvents.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "apps/webapp/src/modules/courses/ports.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "apps/webapp/src/modules/program-item-discussion/types.ts",
      "packages/platform-merge/src/mergeFailureClassification.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "assigned_by",
          "assignment_source",
          "organization_id",
          "patient_user_id",
          "status",
          "template_id",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "status",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "assignment_source",
          "id",
          "organization_id",
          "patient_plan_last_opened_at",
          "patient_user_id",
          "status",
          "template_id",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "patient_plan_last_opened_at",
          "patient_user_id",
          "status",
          "updated_at"
        ]
      }
    ]
  },
  "public.treatment_program_template_stage_groups": {
    "kind": "direct",
    "purpose": "группы в этапе шаблона — группировка в шаблоне",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "organization_id",
          "schedule_text",
          "sort_order",
          "stage_id",
          "system_kind",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "organization_id",
          "schedule_text",
          "sort_order"
        ]
      }
    ]
  },
  "public.treatment_program_template_stage_items": {
    "kind": "direct",
    "purpose": "задания шаблона — содержимое шаблона",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts",
      "apps/webapp/src/modules/treatment-program/types.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "comment",
          "group_id",
          "item_ref_id",
          "item_type",
          "organization_id",
          "settings",
          "sort_order",
          "stage_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "comment",
          "group_id",
          "item_ref_id",
          "item_type",
          "organization_id",
          "settings",
          "sort_order"
        ]
      }
    ]
  },
  "public.treatment_program_template_stages": {
    "kind": "direct",
    "purpose": "этапы шаблона — структура шаблона",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "description",
          "expected_duration_days",
          "expected_duration_text",
          "goals",
          "objectives",
          "organization_id",
          "sort_order",
          "template_id",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "expected_duration_days",
          "expected_duration_text",
          "goals",
          "objectives",
          "organization_id",
          "sort_order",
          "title"
        ]
      }
    ]
  },
  "public.treatment_program_templates": {
    "kind": "direct",
    "purpose": "шаблоны программ лечения — без них нечего назначать пациенту",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgClinicalTests.ts",
      "apps/webapp/src/infra/repos/pgCourses.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgRecommendations.ts",
      "apps/webapp/src/infra/repos/pgTestSets.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgram.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "created_by",
          "description",
          "organization_id",
          "status",
          "title"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "description",
          "organization_id",
          "status",
          "title",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_channel_bindings": {
    "kind": "direct",
    "purpose": "привязка мессенджера — вход через Telegram/MAX и рассылки",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts",
      "apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts",
      "apps/integrator/src/infra/db/integratorDrizzleSchema.ts",
      "apps/integrator/src/infra/db/repos/platformUserByChannel.ts",
      "apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts",
      "apps/integrator/src/infra/db/schema/integratorPublicProduct.ts",
      "apps/integrator/src/infra/db/writePort.ts",
      "apps/integrator/src/infra/operatorIncident/operatorHealthAlertConfigIntegrator.ts",
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/integrator/src/shared/devDeliveryRedirect.ts",
      "apps/integrator/src/shared/phoneLinkUserMessages.ts",
      "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/platformUserMergePreview.ts",
      "apps/webapp/src/infra/repos/broadcastChannelCounts.ts",
      "apps/webapp/src/infra/repos/loadPlatformUserChannelBindings.ts",
      "apps/webapp/src/infra/repos/mergeLegacySupportConversations.ts",
      "apps/webapp/src/infra/repos/pgAdminNotificationTargets.ts",
      "apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts",
      "apps/webapp/src/infra/repos/pgAnalyticsAudience.ts",
      "apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkClaim.ts",
      "apps/webapp/src/infra/repos/pgChannelLinkStart.ts",
      "apps/webapp/src/infra/repos/pgChannelPreferences.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgIdentityResolution.ts",
      "apps/webapp/src/infra/repos/pgPatientTelegramUsernameMention.ts",
      "apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/infra/repos/pgReminderMessengerTopicDisable.ts",
      "apps/webapp/src/infra/repos/pgSupportCommunication.ts",
      "apps/webapp/src/infra/repos/pgUserByPhone.ts",
      "apps/webapp/src/modules/auth/channelLink.ts",
      "apps/webapp/src/modules/doctor-clients/activeMessengerBindingSql.ts",
      "apps/webapp/src/modules/doctor-clients/ports.ts",
      "packages/platform-merge/src/identityProjectionWrite.ts",
      "packages/platform-merge/src/messengerBindAuditEnrichment.ts",
      "packages/platform-merge/src/messengerPhonePublicBind.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts",
      "packages/platform-merge/src/userContactsMirrorWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel_code",
          "external_id",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "columns": [
          "bot_blocked_at",
          "bot_blocked_reason",
          "channel_code",
          "display_handle",
          "external_id",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "bot_blocked_at",
          "bot_blocked_reason",
          "display_handle",
          "external_id",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_channel_preferences": {
    "kind": "direct",
    "purpose": "согласия по каналам — по какому каналу писать пациенту",
    "codePaths": [
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
      "apps/webapp/src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx",
      "apps/webapp/src/infra/repos/pgChannelPreferences.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/upsertBroadcastDefaultsAfterChannelBind.ts",
      "apps/webapp/src/modules/doctor-broadcasts/ports.ts",
      "apps/webapp/src/modules/patient-notifications/profileTopicChannelsModel.ts",
      "packages/platform-merge/src/identityProjectionWrite.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel_code",
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "is_preferred_for_auth",
          "platform_user_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "is_preferred_for_auth",
          "platform_user_id",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "channel_code",
          "id",
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "is_preferred_for_auth",
          "platform_user_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel_code",
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "platform_user_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "platform_user_id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_contacts": {
    "kind": "direct",
    "purpose": "сводный индекс контактов — вход по почте/телефону и поиск пациента",
    "codePaths": [
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/broadcastChannelCounts.ts",
      "apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts",
      "apps/webapp/src/infra/repos/pgDoctorClientCreate.ts",
      "apps/webapp/src/infra/repos/userContactsSql.ts",
      "packages/platform-merge/src/messengerPhonePublicBind.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts",
      "packages/platform-merge/src/userContactsMirrorWrite.ts",
      "packages/platform-merge/src/userIdentityFioWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "confirmed_at",
          "contact_kind",
          "created_at",
          "id",
          "is_primary",
          "platform_user_id",
          "source_origin",
          "updated_at",
          "value_normalized"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "confirmed_at",
          "contact_kind",
          "is_primary",
          "platform_user_id",
          "source_origin",
          "updated_at",
          "value_normalized"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_identity": {
    "kind": "direct",
    "purpose": "ФИО и дата рождения — имя пациента во всех экранах",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgBookingCalendar.ts",
      "apps/webapp/src/infra/repos/pgBookingEngine.ts",
      "apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts",
      "apps/webapp/src/infra/repos/pgClientMediaFolders.ts",
      "apps/webapp/src/infra/repos/pgDoctorAnalyticsMetricAccounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts",
      "apps/webapp/src/infra/repos/pgDoctorClientCreate.ts",
      "apps/webapp/src/infra/repos/pgLfkExercises.ts",
      "apps/webapp/src/infra/repos/pgLfkTemplates.ts",
      "apps/webapp/src/infra/repos/pgMaterialRating.ts",
      "apps/webapp/src/infra/repos/pgMaterialRatingFeedback.ts",
      "apps/webapp/src/infra/repos/pgOrganizationMembership.ts",
      "apps/webapp/src/infra/repos/pgPatientOrganization.ts",
      "apps/webapp/src/infra/repos/pgProductAnalytics.ts",
      "apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts",
      "apps/webapp/src/infra/repos/s3MediaStorage.ts",
      "apps/webapp/src/infra/repos/userIdentityFioSql.ts",
      "packages/platform-merge/src/userIdentityFioWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "columns": [
          "birth_date",
          "display_name",
          "first_name",
          "last_name",
          "patronymic",
          "platform_user_id",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "birth_date",
          "display_name",
          "first_name",
          "last_name",
          "patronymic",
          "updated_at"
        ]
      }
    ]
  },
  "public.user_notification_topic_channels": {
    "kind": "direct",
    "purpose": "тема × канал — тонкая настройка уведомлений",
    "codePaths": [
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/integrator/src/kernel/contracts/ports.ts",
      "apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts",
      "apps/webapp/src/app/api/patient/web-push/unsubscribe/route.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/pgTopicChannelPrefs.ts",
      "apps/webapp/src/modules/reminders/disableReminderMessengerTopic.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "channel_code",
          "is_enabled",
          "topic_code",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "columns": [
          "channel_code",
          "is_enabled",
          "topic_code",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_notification_topics": {
    "kind": "direct",
    "purpose": "подписки на темы — пациент перестанет управлять уведомлениями",
    "codePaths": [
      "apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts",
      "apps/webapp/src/infra/repos/pgPatientNotificationTopics.ts",
      "apps/webapp/src/infra/repos/pgReminderWebappNotifyGate.ts",
      "apps/webapp/src/infra/repos/pgUserProjection.ts",
      "apps/webapp/src/modules/patient-notifications/patientNotificationTopicsPort.ts",
      "apps/webapp/src/modules/patient-notifications/profileTopicChannelsModel.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "is_enabled",
          "topic_code",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled",
          "updated_at"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "columns": [
          "is_enabled",
          "topic_code",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "is_enabled",
          "updated_at"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
  "public.user_phone_history": {
    "kind": "direct",
    "purpose": "история телефонов — смена номера и поиск по старому номеру",
    "codePaths": [
      "apps/webapp/src/infra/repos/pgChannelPreferences.ts",
      "apps/webapp/src/infra/repos/pgDoctorClientCreate.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgPhoneHistory.ts",
      "apps/webapp/src/modules/auth/oauthContactResolve.ts",
      "apps/webapp/src/modules/auth/userByPhonePort.ts",
      "packages/platform-merge/src/identityProjectionWrite.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts",
      "packages/platform-merge/src/phoneHistorySync.ts",
      "packages/platform-merge/src/userContactsMirrorWrite.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "confirming_channel",
          "organization_id",
          "phone_normalized",
          "platform_user_id",
          "source",
          "valid_from",
          "valid_to"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "valid_to"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "id",
          "phone_normalized",
          "platform_user_id",
          "source",
          "valid_from",
          "valid_to"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "organization_id",
          "phone_normalized",
          "platform_user_id",
          "source",
          "valid_from",
          "valid_to"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "platform_user_id",
          "valid_to"
        ]
      }
    ]
  },
  "public.user_web_push_subscriptions": {
    "kind": "direct",
    "purpose": "push-подписки браузера — без неё нет web-push",
    "codePaths": [
      "apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts",
      "apps/integrator/src/shared/devDeliveryRedirect.ts",
      "apps/webapp/src/app-layer/health/adminWebPushHealthMetrics.ts",
      "apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts",
      "apps/webapp/src/app-layer/principal/sessionPrincipal.ts",
      "apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts",
      "apps/webapp/src/infra/platformUserFullPurge.ts",
      "apps/webapp/src/infra/repos/broadcastChannelCounts.ts",
      "apps/webapp/src/infra/repos/pgDoctorClients.ts",
      "apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts",
      "packages/platform-merge/src/pgPlatformUserMerge.ts"
    ],
    "grants": [
      {
        "role": "app_staff",
        "operations": [
          "SELECT"
        ],
        "columns": "table"
      },
      {
        "role": "app_staff",
        "operations": [
          "INSERT"
        ],
        "columns": [
          "auth",
          "endpoint",
          "p256dh",
          "updated_at",
          "user_agent",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "auth",
          "p256dh",
          "updated_at",
          "user_agent",
          "user_id"
        ]
      },
      {
        "role": "app_staff",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "SELECT"
        ],
        "columns": [
          "endpoint",
          "id",
          "updated_at",
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "UPDATE"
        ],
        "columns": [
          "user_id"
        ]
      },
      {
        "role": "app_tenant_service",
        "operations": [
          "DELETE"
        ],
        "columns": "table"
      }
    ]
  },
};
