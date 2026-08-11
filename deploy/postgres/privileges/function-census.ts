/**
 * Executable function census restored from evidence/25 + evidence/30 and independently
 * reconciled with the PostgreSQL 16 TEST/DEV catalogs on 2026-08-11.
 *
 * The evidence census had 244 SECURITY DEFINER functions. Three obsolete context roots
 * (install_signed_context/release_principal_context/reset_principal_context) are intentionally
 * absent. The three surviving scalar accessors are supplied by REV10_CONTEXT, leaving 238
 * business/trigger roots here. Relation surfaces are lexical upper bounds and are not grants.
 */
import type { DeclaredFunction } from './types.ts';

export const LEGACY_DEFINER_CENSUS_COUNT = 244 as const;
export const OBSOLETE_CONTEXT_SIGNATURES = [
  'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
  'app.release_principal_context()',
  'app.reset_principal_context()',
] as const;

export const BUSINESS_SEAM_FUNCTIONS: Record<string, DeclaredFunction> = {
  "app.accept_org_invite(text,uuid,text)": {
    "owner": "app_seam_org_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_invite_owner",
    "typedArgs": [
      "text",
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organization_members",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "role",
          "specialist_id",
          "status",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "created_at",
          "updated_at",
          "tariff_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.organization_member_invites",
        "columns": [
          "id",
          "organization_id",
          "invited_email",
          "invited_role",
          "token_hash",
          "status",
          "expires_at",
          "accepted_by_platform_user_id",
          "accepted_membership_id",
          "created_at",
          "accepted_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "created_at",
          "updated_at",
          "email",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "source",
          "status",
          "created_at",
          "updated_at",
          "paid_additional_seats"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_org_entitlement_overrides",
        "columns": [
          "id",
          "organization_id",
          "mechanic",
          "enabled",
          "created_at",
          "updated_at",
          "seat_limit_override",
          "expires_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_tariffs",
        "columns": [
          "id",
          "mechanics",
          "created_at",
          "updated_at",
          "included_seats"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)": {
    "owner": "app_seam_reminder_appointment_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_appointment_owner",
    "typedArgs": [
      "uuid",
      "integer",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "attempt_count",
          "next_retry_at",
          "dead_at",
          "last_error",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.apply_paid_saas_billing_tariff(uuid,uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "updated_at",
          "tariff_id"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_invoices",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.apply_specialist_task_reminder_success_outcome(uuid)": {
    "owner": "app_seam_reminder_specialist_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_specialist_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "payload_json",
          "status",
          "sent_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.specialist_tasks",
        "columns": [
          "id",
          "reminder_sent_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_channel_link_lock_unused_secret(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.channel_link_secrets",
        "columns": [
          "id",
          "used_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_channel_link_mark_secret_used_if_unused(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.channel_link_secrets",
        "columns": [
          "id",
          "used_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_channel_link_mark_secret_used(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.channel_link_secrets",
        "columns": [
          "id",
          "used_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_channel_link_read_secret(text,text)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.channel_link_secrets",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "token_hash",
          "expires_at",
          "used_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_channel_link_replace_secret(uuid,text,text,timestamp with time zone)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.channel_link_secrets",
        "columns": [
          "user_id",
          "channel_code",
          "token_hash",
          "expires_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_email_setup_delete(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_email_setup_tokens",
        "columns": [
          "id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_email_setup_insert(uuid,text,text,timestamp with time zone,text,uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text",
      "timestamp with time zone",
      "text",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_email_setup_tokens",
        "columns": [
          "id",
          "user_id",
          "email_normalized",
          "token_hash",
          "expires_at",
          "source",
          "created_by_user_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_email_setup_mark_used(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_email_setup_tokens",
        "columns": [
          "id",
          "expires_at",
          "used_at",
          "revoked_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_email_setup_read(text)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_email_setup_tokens",
        "columns": [
          "id",
          "user_id",
          "email_normalized",
          "token_hash",
          "expires_at",
          "used_at",
          "revoked_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_email_setup_revoke_active(uuid,text)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_email_setup_tokens",
        "columns": [
          "user_id",
          "email_normalized",
          "used_at",
          "revoked_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_login_token_confirm(text)": {
    "owner": "app_seam_login_token_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_login_token_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.login_tokens",
        "columns": [
          "token_hash",
          "status",
          "confirmed_at",
          "expires_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_login_token_create(text,uuid,text,timestamp with time zone)": {
    "owner": "app_seam_login_token_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_login_token_owner",
    "typedArgs": [
      "text",
      "uuid",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.login_tokens",
        "columns": [
          "id",
          "token_hash",
          "user_id",
          "method",
          "status",
          "expires_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_login_token_expire_past()": {
    "owner": "app_seam_login_token_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_login_token_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.login_tokens",
        "columns": [
          "status",
          "expires_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_login_token_mark_session_issued(text)": {
    "owner": "app_seam_login_token_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_login_token_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.login_tokens",
        "columns": [
          "token_hash",
          "status",
          "session_issued_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_login_token_read(text)": {
    "owner": "app_seam_login_token_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_login_token_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.login_tokens",
        "columns": [
          "id",
          "token_hash",
          "user_id",
          "method",
          "status",
          "confirmed_at",
          "expires_at",
          "session_issued_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_oauth_find_user(text,text)": {
    "owner": "app_seam_oauth_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_oauth_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_oauth_bindings",
        "columns": [
          "user_id",
          "provider",
          "provider_user_id",
          "email"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_oauth_list_user_providers(uuid)": {
    "owner": "app_seam_oauth_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_oauth_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_oauth_bindings",
        "columns": [
          "id",
          "user_id",
          "provider"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_oauth_upsert_binding(uuid,text,text,text)": {
    "owner": "app_seam_oauth_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_oauth_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_oauth_bindings",
        "columns": [
          "user_id",
          "provider",
          "provider_user_id",
          "email"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_phone_bind_lock_channel_binding(text,text)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_phone_bind_upsert_channel_binding(uuid,text,text)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_rate_limit_count(text,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "bigint",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.auth_rate_limit_events",
        "columns": [
          "scope",
          "key"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_rate_limit_prune_key(text,text,timestamp with time zone)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.auth_rate_limit_events",
        "columns": [
          "scope",
          "key",
          "occurred_at"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_rate_limit_prune_scope(text,timestamp with time zone,integer)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "timestamp with time zone",
      "integer"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.auth_rate_limit_events",
        "columns": [
          "scope",
          "occurred_at"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_rate_limit_record(text,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.auth_rate_limit_events",
        "columns": [
          "scope",
          "key",
          "occurred_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_increment_failed(uuid)": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "attempts_failed",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_read_self()": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "pin_hash",
          "attempts_failed",
          "locked_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_read(uuid)": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "pin_hash",
          "attempts_failed",
          "locked_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_reset_attempts(uuid)": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "attempts_failed",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_upsert_self(text)": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "pin_hash",
          "attempts_failed",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.auth_user_pin_upsert(uuid,text)": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_pins",
        "columns": [
          "user_id",
          "pin_hash",
          "attempts_failed",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.begin_staff_login_challenge(text,timestamp with time zone)": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "factor_verified_at",
          "login_challenge_hash",
          "login_challenge_expires_at",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.bump_platform_user_session_epoch_self()": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "session_epoch"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.cancel_patient_invite_email_proof(text,text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.patient_invites",
        "columns": [
          "status",
          "continuation_hash",
          "proof_email_normalized",
          "proof_code_hash",
          "proof_started_at",
          "proof_expires_at",
          "proof_attempts",
          "proof_verified_at",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.choose_organization_first_tariff(uuid,uuid)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.admin_audit_log",
        "columns": [
          "id",
          "actor_id",
          "action",
          "target_id",
          "details",
          "status",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at",
          "tariff_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_accounts",
        "columns": [
          "id",
          "organization_id",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "saas_billing_account_id",
          "tariff_id",
          "source",
          "status",
          "lifecycle_state",
          "current_period_starts_at",
          "current_period_ends_at",
          "updated_at",
          "tariff_snapshot",
          "pending_tariff_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "started_at",
          "ends_at",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "status",
          "created_by",
          "updated_at",
          "discount_ends_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_tariffs",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_trial_policy",
        "columns": [
          "key",
          "duration_days",
          "start_event",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "is_active",
          "updated_at",
          "discount_window_days"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.claim_unbound_patient_invite_email(text,text,text,bigint,text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "bigint",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "app.context_signing_secrets",
        "columns": [
          "id",
          "secret"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "portal_activated_at",
          "portal_activated_via"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "patient_user_id",
          "enrollment_id",
          "status",
          "invited_email_normalized",
          "expires_at",
          "accepted_by_platform_user_id",
          "accepted_via",
          "continuation_hash",
          "continuation_expires_at",
          "proof_email_normalized",
          "proof_code_hash",
          "proof_expires_at",
          "proof_verified_at",
          "updated_at",
          "accepted_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_merge_candidates",
        "columns": [
          "id",
          "organization_id",
          "anchor_user_id",
          "candidate_user_id",
          "reason",
          "status",
          "payload"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "role",
          "updated_at",
          "email",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.close_active_user_phone_history(uuid)": {
    "owner": "app_seam_phone_binding_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=app, public, pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_binding_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_phone_history",
        "columns": [
          "platform_user_id",
          "valid_to"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.complete_staff_totp_enrollment(text,jsonb)": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [
      "text",
      "jsonb"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "factor_type",
          "totp_secret_ciphertext",
          "pending_totp_secret_ciphertext",
          "factor_verified_at",
          "recovery_code_hashes",
          "recovery_codes_confirmed_at",
          "replacement_required",
          "failed_attempts",
          "locked_until",
          "session_version",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.confirm_staff_recovery_codes()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "factor_verified_at",
          "recovery_code_hashes",
          "recovery_codes_confirmed_at",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.consume_staff_recovery_login(text,text)": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "recovery_code_hashes",
          "replacement_required",
          "failed_attempts",
          "locked_until",
          "session_version",
          "login_challenge_hash",
          "login_challenge_expires_at",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.consume_staff_totp_login(text)": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "failed_attempts",
          "locked_until",
          "login_challenge_hash",
          "login_challenge_expires_at",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.create_specialist_signup_intent(uuid,text,text,text,text)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "email_normalized",
          "organization_title",
          "specialist_full_name",
          "organization_slug"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.current_patient_has_active_org_enrollment(uuid)": {
    "owner": "app_seam_patient_org_projection_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_org_projection_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.current_patient_has_password_credentials()": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.current_patient_has_web_oauth_binding()": {
    "owner": "app_seam_oauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_oauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_oauth_bindings",
        "columns": [
          "user_id",
          "provider"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.current_provisioned_owner_organization()": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organization_members",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "role",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_delete_email_challenge_by_id(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_delete_email_challenges_for_user(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "user_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_enqueue_otp_delivery(uuid,uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "expires_at",
          "pending_delivery_code",
          "delivery_token"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "user_id",
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "event_id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "attempt_count",
          "max_attempts",
          "next_retry_at",
          "organization_id",
          "priority"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_email_challenge_for_confirm(uuid,uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "code_hash",
          "expires_at",
          "attempts",
          "purpose"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_email_challenge_for_consume(uuid,uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "code_hash",
          "expires_at",
          "attempts",
          "purpose"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_email_otp_lock(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "bigint",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_otp_locks",
        "columns": [
          "user_id",
          "locked_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_email_owner_conflict(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_email_send_cooldown(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "user_id",
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_latest_email_challenge_for_user(uuid,bigint)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "code_hash",
          "expires_at",
          "attempts",
          "created_at",
          "purpose"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_find_latest_pending_email_challenge_for_user(uuid,bigint)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "code_hash",
          "expires_at",
          "attempts",
          "created_at",
          "purpose"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_increment_email_challenge_attempts(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "attempts"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_insert_email_challenge(uuid,text,text,bigint)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "code_hash",
          "expires_at",
          "attempts"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_register_email_otp_lockout(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "bigint",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_otp_locks",
        "columns": [
          "user_id",
          "locked_until",
          "lockout_cycle"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_reset_email_otp_lockout(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_otp_locks",
        "columns": [
          "user_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_set_email_challenge_delivery_code(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "pending_delivery_code",
          "delivery_token",
          "delivery_claimed_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_set_email_challenge_purpose(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "purpose"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_upsert_email_send_cooldown(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "user_id",
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_auth_verify_user_email(uuid,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "email",
          "email_verified_at",
          "email_normalized"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_consume_latest_challenge(text,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "code_hash",
          "expires_at",
          "attempts",
          "created_at",
          "purpose"
        ],
        "operations": [
          "SELECT",
          "UPDATE",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "created_at",
          "email",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_delete_unverified_registration(uuid)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "role",
          "email_verified_at",
          "merged_into_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_find_email_send_cooldown_by_email(text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_find_latest_email_challenge_by_email(text,bigint)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id",
          "email",
          "code_hash",
          "expires_at",
          "attempts",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_find_or_create_user(text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "created_at",
          "email",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_find_user_by_email(text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_otp_public_register_patient(text,text,text,text)": {
    "owner": "app_seam_email_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_email_otp_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "first_name",
          "last_name",
          "email",
          "email_verified_at",
          "merged_into_id",
          "email_normalized",
          "patronymic"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_password_delete_unverified_registration(uuid)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "role",
          "email_verified_at",
          "merged_into_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_password_find_login_candidate(text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_password_find_user_id_by_email_challenge(uuid)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_challenges",
        "columns": [
          "id",
          "user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.email_password_register_pending(text,text,text,text,text,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "updated_at",
          "first_name",
          "last_name",
          "email",
          "merged_into_id",
          "email_normalized",
          "patronymic"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.ensure_staff_security_profile()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.exchange_patient_invite(text,text,timestamp with time zone)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "portal_activated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "patient_user_id",
          "enrollment_id",
          "token_hash",
          "status",
          "invited_email_normalized",
          "expires_at",
          "bearer_exchanged_at",
          "continuation_hash",
          "continuation_expires_at",
          "updated_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.find_platform_user_ids_by_any_confirmed_email(text)": {
    "owner": "app_seam_identity_lookup_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_identity_lookup_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "email",
          "merged_into_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_contacts",
        "columns": [
          "id",
          "platform_user_id",
          "contact_kind",
          "value_normalized",
          "is_primary",
          "confirmed_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_latest_specialist_signup_intent_for_user()": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "email_normalized",
          "organization_title",
          "specialist_full_name",
          "status",
          "provisioned_organization_id",
          "provisioned_specialist_id",
          "provisioned_membership_id",
          "created_at",
          "organization_slug"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_pending_specialist_signup_intent(uuid,uuid)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "email_normalized",
          "organization_title",
          "specialist_full_name",
          "status",
          "provisioned_organization_id",
          "provisioned_specialist_id",
          "provisioned_membership_id",
          "organization_slug"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_preferred_auth_channel_code(uuid)": {
    "owner": "app_seam_identity_lookup_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_identity_lookup_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "user_id",
          "channel_code",
          "is_preferred_for_auth",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_public_config_bool(text)": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_public_reference_baseline(text)": {
    "owner": "app_seam_catalog_public_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_catalog_public_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.reference_catalog_baselines",
        "columns": [
          "version",
          "definition_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_specialist_signup_intent_by_challenge(uuid)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "email_normalized",
          "organization_title",
          "specialist_full_name",
          "status",
          "provisioned_organization_id",
          "provisioned_specialist_id",
          "provisioned_membership_id",
          "organization_slug"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_staff_security_profile()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "factor_type",
          "totp_secret_ciphertext",
          "pending_totp_secret_ciphertext",
          "factor_verified_at",
          "recovery_code_hashes",
          "recovery_codes_confirmed_at",
          "replacement_required",
          "failed_attempts",
          "locked_until",
          "session_version",
          "login_challenge_hash",
          "login_challenge_expires_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_staff_security_session_state()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "factor_verified_at",
          "session_version"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.get_web_push_vapid_public_key()": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler",
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.increment_media_playback_resolution_stat(uuid,uuid,text,boolean)": {
    "owner": "app_seam_telemetry_media_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_media_owner",
    "typedArgs": [
      "uuid",
      "uuid",
      "text",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_playback_stats_hourly",
        "columns": [
          "bucket_hour",
          "delivery",
          "resolved_count",
          "fallback_count"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_current_patient_test_account()": {
    "owner": "app_seam_telemetry_exclusion_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_exclusion_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "phone_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_max_bot_configured()": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_organization_slug_available(text)": {
    "owner": "app_seam_public_slug_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_public_slug_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.organization_slug_claims",
        "columns": [
          "slug"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_platform_registration_analytics_user_excluded(uuid)": {
    "owner": "app_seam_telemetry_exclusion_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_exclusion_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "phone_normalized",
          "role"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_sms_provider_configured()": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_smtp_outbound_configured()": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.is_telegram_login_configured()": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "audience",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_active_booking_cities()": {
    "owner": "app_seam_catalog_public_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_catalog_public_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.booking_cities",
        "columns": [
          "id",
          "code",
          "title",
          "is_active",
          "sort_order"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_clinical_test_measure_kinds()": {
    "owner": "app_seam_catalog_admin_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_catalog_admin_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.clinical_test_measure_kinds",
        "columns": [
          "id",
          "code",
          "label",
          "sort_order"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_google_calendar_probe_organization_ids()": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_platform_organization_members(uuid)": {
    "owner": "app_seam_org_directory_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_directory_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organization_members",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "role",
          "specialist_id",
          "status",
          "created_at",
          "updated_at",
          "doctor_screens_disabled"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_scheduler_reminder_organization_ids()": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "rule_id",
          "status",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "integrator_rule_id",
          "integrator_user_id",
          "is_enabled",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.list_web_push_reminder_organization_ids(timestamp with time zone)": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog, public"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "integrator_user_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "platform_user_id",
          "integrator_user_id",
          "is_enabled",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.lookup_patient_invite_continuation(text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "portal_activated_at",
          "portal_activated_via"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "patient_user_id",
          "enrollment_id",
          "status",
          "invited_email_normalized",
          "expires_at",
          "accepted_by_platform_user_id",
          "accepted_via",
          "continuation_hash",
          "continuation_expires_at",
          "proof_code_hash",
          "proof_expires_at",
          "proof_verified_at",
          "updated_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.lookup_pending_org_invite(text)": {
    "owner": "app_seam_org_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_invite_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.organization_member_invites",
        "columns": [
          "id",
          "organization_id",
          "invited_email",
          "invited_role",
          "token_hash",
          "status",
          "expires_at",
          "created_by_platform_user_id",
          "accepted_by_platform_user_id",
          "accepted_membership_id",
          "created_at",
          "accepted_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.mark_operator_incident_alert_sent(uuid)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id",
          "alert_sent_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.mark_patient_reminder_occurrence_queued(text,integer,text[])": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [
      "text",
      "integer",
      "text[]"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "status",
          "queued_at",
          "updated_at",
          "organization_id",
          "platform_user_id",
          "delivery_generation"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "event_id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "updated_at",
          "notification_topic_code",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.open_or_touch_operator_incident(text,text,text,text,text)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id",
          "dedup_key",
          "direction",
          "integration",
          "error_class",
          "error_detail",
          "last_seen_at",
          "occurrence_count",
          "resolved_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.open_or_touch_operator_probe_incident(text,text,text)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [],
    "delegatesTo": [
      "app.open_or_touch_operator_incident(text,text,text,text,text)"
    ],
    "invocation": "runtime"
  },
  "app.operator_incident_alert_already_sent(uuid)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id",
          "alert_sent_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "uuid",
      "text",
      "bigint",
      "bigint",
      "text",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_challenges",
        "columns": [
          "id",
          "purpose",
          "user_id",
          "challenge",
          "expires_at",
          "consumed_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id",
          "counter",
          "device_type",
          "backed_up",
          "last_used_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_complete_registration(uuid,uuid,text,text,bigint,jsonb,text,boolean)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "uuid",
      "uuid",
      "text",
      "text",
      "bigint",
      "jsonb",
      "text",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_challenges",
        "columns": [
          "id",
          "purpose",
          "user_id",
          "challenge",
          "expires_at",
          "consumed_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id",
          "public_key",
          "counter",
          "transports",
          "device_type",
          "backed_up"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_delete_current_credential(text)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_get_or_create_account(uuid,text)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_accounts",
        "columns": [
          "user_id",
          "user_handle"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "uuid",
      "text",
      "uuid",
      "text",
      "text",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_challenges",
        "columns": [
          "id",
          "purpose",
          "user_id",
          "challenge",
          "expected_origin",
          "rp_id",
          "expires_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_list_current_credentials()": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id",
          "transports",
          "device_type",
          "backed_up",
          "created_at",
          "last_used_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_list_current_exclusions()": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id",
          "transports"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_read_challenge(uuid,text)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_challenges",
        "columns": [
          "id",
          "purpose",
          "user_id",
          "challenge",
          "expected_origin",
          "rp_id",
          "expires_at",
          "consumed_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.passkey_read_credential(text)": {
    "owner": "app_seam_passkey_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_passkey_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_passkey_accounts",
        "columns": [
          "user_id",
          "user_handle"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_passkey_credentials",
        "columns": [
          "credential_id",
          "user_id",
          "public_key",
          "counter",
          "transports",
          "device_type",
          "backed_up"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_credentials_replace_self(text,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.password_login_identifier_protection",
        "columns": [
          "identifier_key",
          "failed_attempts",
          "next_allowed_at",
          "locked_until",
          "verification_lease_token",
          "verification_lease_until",
          "leased_user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "email",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash",
          "updated_at",
          "failed_attempts",
          "locked_until",
          "next_allowed_at",
          "verification_lease_token",
          "verification_lease_until"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_credentials_upsert_self(text,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.password_login_identifier_protection",
        "columns": [
          "identifier_key",
          "failed_attempts",
          "next_allowed_at",
          "locked_until",
          "verification_lease_token",
          "verification_lease_until",
          "leased_user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "email",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash",
          "updated_at",
          "failed_attempts",
          "locked_until",
          "next_allowed_at",
          "verification_lease_token",
          "verification_lease_until"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_login_acquire(text,text,uuid,text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "text",
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.password_altcha_challenges",
        "columns": [
          "challenge_id",
          "identifier_key",
          "purpose",
          "challenge_digest",
          "expires_at",
          "consumed_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.password_login_identifier_protection",
        "columns": [
          "identifier_key",
          "failed_attempts",
          "next_allowed_at",
          "locked_until",
          "verification_lease_token",
          "verification_lease_until",
          "leased_user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "email",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash",
          "updated_at",
          "failed_attempts",
          "locked_until",
          "next_allowed_at",
          "verification_lease_token",
          "verification_lease_until"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_login_complete(uuid,boolean)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "uuid",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.password_login_identifier_protection",
        "columns": [
          "identifier_key",
          "failed_attempts",
          "next_allowed_at",
          "locked_until",
          "verification_lease_token",
          "verification_lease_until",
          "leased_user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "email_verified_at",
          "merged_into_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "updated_at",
          "failed_attempts",
          "locked_until",
          "next_allowed_at",
          "verification_lease_token",
          "verification_lease_until"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text",
      "uuid",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.password_altcha_challenges",
        "columns": [
          "challenge_id",
          "identifier_key",
          "purpose",
          "challenge_digest",
          "expires_at",
          "consumed_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.password_login_identifier_protection",
        "columns": [
          "identifier_key",
          "failed_attempts",
          "locked_until"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "email",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "failed_attempts",
          "locked_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.password_login_read_altcha_secret()": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_cancel_pending_reminder_occurrences(text)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "rule_id",
          "status",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_disable_reminder_messenger_topic(text,text)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "integrator_user_id",
          "email",
          "email_verified_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_occurrence_history",
        "columns": [
          "id",
          "integrator_occurrence_id",
          "integrator_rule_id",
          "integrator_user_id",
          "category",
          "status",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "integrator_user_id",
          "category",
          "is_enabled",
          "updated_at",
          "linked_object_type",
          "reminder_intent",
          "notification_topic_code",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "is_enabled_for_notifications",
          "updated_at",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_done_reminder_occurrence(text)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "planned_at",
          "status",
          "sent_at",
          "created_at",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "created_at",
          "integrator_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_journal",
        "columns": [
          "id",
          "rule_id",
          "occurrence_id",
          "action",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_occurrence_history",
        "columns": [
          "id",
          "integrator_occurrence_id",
          "integrator_rule_id",
          "integrator_user_id",
          "category",
          "status",
          "occurred_at",
          "created_at",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "integrator_user_id",
          "category",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_reminder_materialization_fingerprint(text,text)": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "planned_at",
          "created_at",
          "updated_at",
          "organization_id",
          "platform_user_id",
          "delivery_generation"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "event_id",
          "kind",
          "payload_json",
          "created_at",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "created_at",
          "updated_at",
          "integrator_user_id",
          "email",
          "email_verified_at",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "integrator_user_id",
          "is_enabled",
          "updated_at",
          "created_at",
          "linked_object_type",
          "linked_object_id",
          "custom_title",
          "custom_text",
          "reminder_intent",
          "display_title",
          "notification_topic_code",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id",
          "created_at",
          "bot_blocked_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "is_enabled_for_notifications",
          "created_at",
          "updated_at",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topics",
        "columns": [
          "user_id",
          "topic_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id",
          "endpoint",
          "p256dh",
          "auth",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_reminder_notification_settings(text,text)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "integrator_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_set_reminder_mute(integer,boolean)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "integer",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "integrator_user_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_set_reminder_muted_until(timestamp with time zone)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "integrator_user_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_skip_reminder_occurrence(uuid,text,text)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "uuid",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "planned_at",
          "status",
          "sent_at",
          "updated_at",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "integrator_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_journal",
        "columns": [
          "id",
          "rule_id",
          "occurrence_id",
          "action",
          "skip_reason",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_occurrence_history",
        "columns": [
          "id",
          "integrator_occurrence_id",
          "integrator_rule_id",
          "integrator_user_id",
          "category",
          "status",
          "occurred_at",
          "skipped_at",
          "skip_reason",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "INSERT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "integrator_user_id",
          "category",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.patient_snooze_reminder_occurrence(uuid,text,integer)": {
    "owner": "app_seam_reminder_patient_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_patient_owner",
    "typedArgs": [
      "uuid",
      "text",
      "integer"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "planned_at",
          "status",
          "queued_at",
          "sent_at",
          "failed_at",
          "delivery_channel",
          "delivery_job_id",
          "error_code",
          "updated_at",
          "organization_id",
          "platform_user_id",
          "delivery_generation"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "integrator_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_journal",
        "columns": [
          "id",
          "rule_id",
          "occurrence_id",
          "action",
          "snooze_until",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_occurrence_history",
        "columns": [
          "id",
          "integrator_occurrence_id",
          "integrator_rule_id",
          "integrator_user_id",
          "category",
          "status",
          "delivery_channel",
          "error_code",
          "occurred_at",
          "snoozed_at",
          "snoozed_until",
          "skipped_at",
          "organization_id",
          "platform_user_id"
        ],
        "operations": [
          "INSERT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "integrator_user_id",
          "category",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_auth_find_latest_challenge_created_at(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "phone",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_auth_find_otp_lock(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "bigint",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_otp_locks",
        "columns": [
          "phone_normalized",
          "locked_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_auth_register_otp_lockout(text,bigint)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "bigint",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_otp_locks",
        "columns": [
          "phone_normalized",
          "locked_until",
          "lockout_cycle"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_auth_reset_otp_lockout(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_otp_locks",
        "columns": [
          "phone_normalized"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_challenge_store_delete_by_phone(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "phone"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_challenge_store_delete(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_challenge_store_increment_attempts(text,bigint)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text",
      "bigint"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id",
          "expires_at",
          "verify_attempts"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_challenge_store_read(text)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id",
          "phone",
          "expires_at",
          "code",
          "channel_context",
          "verify_attempts"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_challenge_store_upsert(text,text,bigint,text,jsonb,integer)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text",
      "text",
      "bigint",
      "text",
      "jsonb",
      "integer"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id",
          "phone",
          "expires_at",
          "code",
          "channel_context",
          "verify_attempts"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text",
      "text",
      "integer",
      "integer"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id",
          "phone",
          "expires_at",
          "code",
          "channel_context",
          "verify_attempts"
        ],
        "operations": [
          "SELECT",
          "UPDATE",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.phone_otp_locks",
        "columns": [
          "phone_normalized",
          "locked_until"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,jsonb)": {
    "owner": "app_seam_phone_otp_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_phone_otp_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "integer",
      "integer",
      "text",
      "jsonb"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.phone_challenges",
        "columns": [
          "challenge_id",
          "phone",
          "expires_at",
          "code",
          "channel_context",
          "created_at",
          "verify_attempts"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.phone_otp_locks",
        "columns": [
          "phone_normalized",
          "locked_until"
        ],
        "operations": [
          "SELECT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.prepare_organization_lifecycle_notification_context(uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "updated_at",
          "cabinet_first_entered_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "started_at",
          "ends_at",
          "updated_at",
          "discount_ends_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.propagate_staff_session_version_to_session_epoch()": {
    "owner": "app_seam_self_security_owner",
    "security": "DEFINER",
    "returns": "trigger",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_self_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "session_epoch"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "trigger"
  },
  "app.provision_specialist_owner(uuid)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organization_members",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "role",
          "specialist_id",
          "status",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "is_active",
          "sort_order",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_specialists",
        "columns": [
          "id",
          "organization_id",
          "full_name",
          "is_active",
          "sort_order",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.clinic_public_directory_entries",
        "columns": [
          "organization_id",
          "slug",
          "display_name",
          "is_published",
          "published_at",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.organization_slug_claims",
        "columns": [
          "id",
          "slug",
          "kind",
          "organization_id",
          "created_by_platform_user_id",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "display_name",
          "role",
          "created_at",
          "updated_at",
          "email_verified_at",
          "merged_into_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "organization_title",
          "specialist_full_name",
          "status",
          "provisioned_organization_id",
          "provisioned_specialist_id",
          "provisioned_membership_id",
          "created_at",
          "provisioned_at",
          "organization_slug"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_curated_playback_health_pre_0196()": {
    "owner": "saas_system_health_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_system_health_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_playback_resolution_events",
        "columns": [
          "delivery",
          "fallback_used",
          "resolved_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_playback_stats_hourly",
        "columns": [
          "bucket_hour",
          "delivery",
          "resolved_count",
          "fallback_count"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_playback_user_video_first_resolve",
        "columns": [
          "first_resolved_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_curated_playback_health()": {
    "owner": "saas_system_health_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_system_health_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_hls_proxy_error_events",
        "columns": [
          "reason_code",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_curated_system_health_pre_0196()": {
    "owner": "saas_system_health_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_system_health_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "value_json",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.idempotency_keys",
        "columns": [
          "key",
          "status",
          "expires_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.integration_webhook_last_status",
        "columns": [
          "source",
          "received_at",
          "processed_ok",
          "http_status_returned"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.integrator_push_outbox",
        "columns": [
          "id",
          "kind",
          "status",
          "next_try_at",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "mime_type",
          "size_bytes",
          "created_at",
          "s3_key",
          "status",
          "video_processing_status",
          "hls_master_playlist_s3_key",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_transcode_jobs",
        "columns": [
          "id",
          "media_id",
          "status",
          "created_at",
          "updated_at",
          "processing_started_at",
          "finished_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.notification_delivery_attempts",
        "columns": [
          "id",
          "created_at",
          "user_id",
          "channel",
          "status",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.operator_health_alert_sent",
        "columns": [
          "id",
          "dedup_key",
          "sent_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id",
          "dedup_key",
          "last_seen_at",
          "occurrence_count",
          "resolved_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.operator_job_status",
        "columns": [
          "job_key",
          "job_family",
          "last_status",
          "last_finished_at",
          "last_success_at",
          "last_failure_at",
          "last_duration_ms",
          "meta_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "channel",
          "status",
          "next_retry_at",
          "sent_at",
          "created_at",
          "updated_at",
          "failure_class",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_delivery_events",
        "columns": [
          "id",
          "channel",
          "status",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_occurrence_history",
        "columns": [
          "id",
          "status",
          "occurred_at",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_curated_system_health()": {
    "owner": "saas_system_health_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_system_health_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_files",
        "columns": [
          "mime_type",
          "created_at",
          "status",
          "preview_status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_playback_client_events",
        "columns": [
          "media_id",
          "event_class",
          "delivery",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.notification_delivery_attempts",
        "columns": [
          "created_at",
          "channel",
          "status",
          "reason",
          "provider_status_code",
          "error_message"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "kind",
          "channel",
          "status",
          "sent_at",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_org_tariff_transition_usage()": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_clinic_billing",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_branches",
        "columns": [
          "organization_id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_patient_active_organizations()": {
    "owner": "app_seam_patient_org_projection_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_org_projection_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "is_active",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_patient_appointment_history()": {
    "owner": "app_seam_patient_booking_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_booking_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_appointments",
        "columns": [
          "id",
          "organization_id",
          "branch_id",
          "room_id",
          "specialist_id",
          "service_id",
          "platform_user_id",
          "start_at",
          "end_at",
          "status",
          "deleted_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_branches",
        "columns": [
          "id",
          "organization_id",
          "title"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_clinic_services",
        "columns": [
          "id",
          "organization_id",
          "title"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_rooms",
        "columns": [
          "id",
          "organization_id",
          "branch_id",
          "title"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_specialists",
        "columns": [
          "id",
          "organization_id",
          "full_name"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_patient_booking_rows(text,timestamp with time zone)": {
    "owner": "app_seam_patient_booking_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_booking_owner",
    "typedArgs": [
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_appointments",
        "columns": [
          "id",
          "organization_id",
          "branch_id",
          "specialist_id",
          "service_id",
          "platform_user_id",
          "duration_minutes",
          "source",
          "status",
          "created_at",
          "updated_at",
          "deleted_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_branches",
        "columns": [
          "id",
          "organization_id",
          "title",
          "city_code",
          "is_active",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_clinic_services",
        "columns": [
          "id",
          "organization_id",
          "title",
          "duration_minutes",
          "price_minor",
          "is_active",
          "public_widget_visible",
          "admin_manual_only",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_specialist_service_availability",
        "columns": [
          "id",
          "organization_id",
          "specialist_id",
          "service_id",
          "branch_id",
          "city_code",
          "is_active",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_specialists",
        "columns": [
          "id",
          "organization_id",
          "is_active",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_bookings",
        "columns": [
          "id",
          "platform_user_id",
          "booking_type",
          "city",
          "category",
          "slot_start",
          "slot_end",
          "status",
          "cancelled_at",
          "cancel_reason",
          "gcal_event_id",
          "contact_phone",
          "contact_email",
          "contact_name",
          "reminder_24h_sent",
          "reminder_2h_sent",
          "created_at",
          "updated_at",
          "branch_id",
          "service_id",
          "branch_service_id",
          "city_code_snapshot",
          "branch_title_snapshot",
          "service_title_snapshot",
          "duration_minutes_snapshot",
          "price_minor_snapshot",
          "source",
          "compat_quality",
          "provenance_created_by",
          "provenance_updated_by",
          "canonical_appointment_id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_patient_organization_entitlements()": {
    "owner": "app_seam_patient_org_projection_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_org_projection_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "tariff_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "current_period_ends_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_org_entitlement_overrides",
        "columns": [
          "id",
          "organization_id",
          "mechanic",
          "enabled",
          "seat_limit_override",
          "quota",
          "expires_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "ends_at",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_current_patient_ui_setting(text,text)": {
    "owner": "app_seam_settings_runtime_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_runtime_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "updated_at",
          "updated_by",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_global_server_runtime_setting(text)": {
    "owner": "app_seam_settings_runtime_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_runtime_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "audience",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_auth_channel_setting(text)": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_clinic_delivery_credential(text,uuid)": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [
      "text",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_google_calendar_setting(text,uuid)": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [
      "text",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_platform_integration_availability()": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_provider_runtime_setting(text)": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_runtime_setting(text)": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_integrator_smtp_outbound_setting()": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_last_saas_isolation_coverage()": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_coverage_runs",
        "columns": [
          "id",
          "status",
          "started_at",
          "finished_at",
          "services_checked",
          "checks_count",
          "unexpected_errors_count"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_media_worker_runtime_setting(text)": {
    "owner": "app_seam_settings_runtime_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_media_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_runtime_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "audience",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_operational_verbose_log_flag()": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker",
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_operator_health_probe_config()": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_operator_outbound_probe_meta()": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_job_status",
        "columns": [
          "job_key",
          "meta_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_org_brand_core_context(uuid)": {
    "owner": "app_seam_patient_org_projection_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_org_projection_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "title",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_org_enforced_quota_usage(uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organization_members",
        "columns": [
          "id",
          "organization_id",
          "specialist_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.organization_member_invites",
        "columns": [
          "id",
          "organization_id",
          "invited_role",
          "status",
          "expires_at",
          "accepted_membership_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_files",
        "columns": [
          "id",
          "size_bytes",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_outbound_provider_incident_health()": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog, public"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_incidents",
        "columns": [
          "direction",
          "resolved_at",
          "acknowledged_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_outgoing_delivery_reclaim_config()": {
    "owner": "app_seam_settings_integrator_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_integrator_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_patient_lfk_complex_cover(uuid)": {
    "owner": "app_seam_patient_lfk_media_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_lfk_media_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.lfk_complex_exercises",
        "columns": [
          "id",
          "complex_id",
          "exercise_id",
          "sort_order",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_complexes",
        "columns": [
          "id",
          "user_id",
          "created_at",
          "platform_user_id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_exercise_media",
        "columns": [
          "id",
          "exercise_id",
          "media_url",
          "media_type",
          "sort_order",
          "created_at",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "created_at",
          "preview_status",
          "preview_sm_key",
          "preview_md_key",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_patient_lfk_complex_exercise_lines(uuid[])": {
    "owner": "app_seam_patient_lfk_media_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_lfk_media_owner",
    "typedArgs": [
      "uuid[]"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.lfk_complex_exercises",
        "columns": [
          "id",
          "complex_id",
          "exercise_id",
          "sort_order",
          "comment",
          "local_comment",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_complexes",
        "columns": [
          "id",
          "user_id",
          "title",
          "platform_user_id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_exercises",
        "columns": [
          "id",
          "title",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_platform_lfk_media_entitlement_refs(uuid)": {
    "owner": "app_seam_patient_lfk_media_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_lfk_media_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.lfk_complex_template_exercises",
        "columns": [
          "id",
          "template_id",
          "exercise_id",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_complex_templates",
        "columns": [
          "id",
          "status",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_exercise_media",
        "columns": [
          "id",
          "exercise_id",
          "media_url",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.lfk_exercises",
        "columns": [
          "id",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "status",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_platform_media_row(uuid)": {
    "owner": "app_seam_patient_lfk_media_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_lfk_media_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "stored_path",
          "mime_type",
          "uploaded_by",
          "s3_key",
          "status",
          "preview_status",
          "preview_sm_key",
          "preview_md_key",
          "video_processing_status",
          "hls_master_playlist_s3_key",
          "poster_s3_key",
          "video_duration_seconds",
          "available_qualities_json",
          "video_delivery_override",
          "usage_purpose",
          "organization_id",
          "owner_kind"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_public_runtime_setting(text,text)": {
    "owner": "app_seam_settings_runtime_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_runtime_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "audience",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_reminder_transactional_email_cooldown(uuid)": {
    "owner": "app_seam_reminder_email_cooldown_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_email_cooldown_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "user_id",
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_saas_billing_payment_provider()": {
    "owner": "app_seam_payment_webhook_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_clinic_billing",
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_payment_webhook_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_saas_isolation_events()": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_events",
        "columns": [
          "event_class",
          "source_service",
          "source_operation",
          "explanation_status",
          "lifecycle_status",
          "occurrence_count",
          "first_seen_at",
          "last_seen_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_saas_isolation_test_scenario_fixture_counts()": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_coverage_runs",
        "columns": [
          "id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_event_hourly",
        "columns": [
          "event_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_events",
        "columns": [
          "id",
          "fingerprint"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_saas_isolation_trend()": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_event_hourly",
        "columns": [
          "bucket_start",
          "occurrence_count"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_webapp_preauth_provider_setting(text)": {
    "owner": "app_seam_settings_preauth_owner",
    "security": "DEFINER",
    "returns": "jsonb",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_preauth_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.read_webapp_server_runtime_setting(text,text)": {
    "owner": "app_seam_settings_runtime_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_settings_runtime_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.app_runtime_settings",
        "columns": [
          "key",
          "scope",
          "organization_id",
          "audience",
          "value_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_current_patient_analytics_event(timestamp with time zone,text,text,text,text,jsonb)": {
    "owner": "app_seam_telemetry_patient_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_patient_owner",
    "typedArgs": [
      "timestamp with time zone",
      "text",
      "text",
      "text",
      "text",
      "jsonb"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_events_recent",
        "columns": [
          "occurred_at",
          "event_type",
          "entry_channel",
          "page_key",
          "user_id",
          "client_session_id",
          "topic_code",
          "push_kind",
          "warmup_slogan_key",
          "metadata",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_hourly",
        "columns": [
          "bucket_hour",
          "event_type",
          "entry_channel",
          "page_key",
          "topic_code",
          "push_kind",
          "warmup_slogan_key",
          "event_count",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_user_hourly",
        "columns": [
          "bucket_hour",
          "user_id",
          "entry_channel",
          "page_key",
          "app_opens",
          "page_views",
          "push_opens",
          "active_minutes",
          "last_seen_at",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_current_patient_push_open(timestamp with time zone,text,uuid)": {
    "owner": "app_seam_telemetry_patient_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_patient_owner",
    "typedArgs": [
      "timestamp with time zone",
      "text",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_events_recent",
        "columns": [
          "id",
          "occurred_at",
          "event_type",
          "entry_channel",
          "page_key",
          "user_id",
          "push_tracking_id",
          "topic_code",
          "push_kind",
          "warmup_slogan_key",
          "metadata",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_hourly",
        "columns": [
          "bucket_hour",
          "event_type",
          "entry_channel",
          "page_key",
          "topic_code",
          "push_kind",
          "warmup_slogan_key",
          "event_count",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_analytics_user_hourly",
        "columns": [
          "bucket_hour",
          "user_id",
          "entry_channel",
          "page_key",
          "app_opens",
          "page_views",
          "push_opens",
          "active_minutes",
          "last_seen_at",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.product_push_notifications",
        "columns": [
          "id",
          "user_id",
          "topic_code",
          "push_kind",
          "warmup_slogan_key",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_failed_staff_factor_attempt()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "timestamp with time zone",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "failed_attempts",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamp with time zone)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_request"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text",
      "text",
      "integer",
      "text",
      "jsonb",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.delivery_attempt_logs",
        "columns": [
          "intent_type",
          "intent_event_id",
          "correlation_id",
          "channel",
          "status",
          "attempt",
          "reason",
          "payload_json",
          "occurred_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_media_playback_resolution_event(uuid,uuid,text,boolean)": {
    "owner": "app_seam_telemetry_media_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_media_owner",
    "typedArgs": [
      "uuid",
      "uuid",
      "text",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.media_files",
        "columns": [
          "id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.media_playback_resolution_events",
        "columns": [
          "id",
          "user_id",
          "media_id",
          "delivery",
          "fallback_used",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamp with time zone)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text",
      "text",
      "integer",
      "text",
      "jsonb",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.delivery_attempt_logs",
        "columns": [
          "intent_type",
          "intent_event_id",
          "correlation_id",
          "channel",
          "status",
          "attempt",
          "reason",
          "payload_json",
          "occurred_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_operator_delivery_attempt(text,text,text,integer,text)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "integer",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.notification_delivery_attempts",
        "columns": [
          "user_id",
          "integrator_user_id",
          "topic_code",
          "intent_type",
          "channel",
          "status",
          "reason",
          "event_id",
          "occurrence_id",
          "metadata",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "event_id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_operator_outbound_probe_run(text,timestamp with time zone,text,jsonb)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text",
      "timestamp with time zone",
      "text",
      "jsonb"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_job_status",
        "columns": [
          "job_key",
          "job_family",
          "last_status",
          "last_started_at",
          "last_finished_at",
          "last_success_at",
          "last_failure_at",
          "last_duration_ms",
          "last_error",
          "meta_json"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_reminder_transactional_email_cooldown(uuid)": {
    "owner": "app_seam_reminder_email_cooldown_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_email_cooldown_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.email_send_cooldowns",
        "columns": [
          "user_id",
          "email_normalized",
          "last_sent_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.record_saas_isolation_coverage(uuid,text,timestamp with time zone,timestamp with time zone,text[],integer,integer)": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [
      "uuid",
      "text",
      "timestamp with time zone",
      "timestamp with time zone",
      "text[]",
      "integer",
      "integer"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_coverage_runs",
        "columns": [
          "id",
          "status",
          "started_at",
          "finished_at",
          "services_checked",
          "checks_count",
          "unexpected_errors_count"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_events",
        "columns": [
          "id",
          "source_service",
          "lifecycle_status",
          "last_seen_at",
          "resolved_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.redeem_patient_invite_email(text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status",
          "portal_activated_at",
          "portal_activated_via"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "patient_user_id",
          "enrollment_id",
          "status",
          "invited_email_normalized",
          "expires_at",
          "accepted_by_platform_user_id",
          "accepted_via",
          "continuation_hash",
          "continuation_expires_at",
          "proof_email_normalized",
          "proof_code_hash",
          "proof_expires_at",
          "proof_verified_at",
          "updated_at",
          "accepted_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_merge_candidates",
        "columns": [
          "id",
          "organization_id",
          "anchor_user_id",
          "candidate_user_id",
          "reason",
          "status",
          "payload"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "role",
          "updated_at",
          "email_verified_at",
          "merged_into_id",
          "email_normalized"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.refresh_specialist_task_reminder_materialization(text)": {
    "owner": "app_seam_reminder_specialist_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_specialist_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "event_id",
          "kind",
          "payload_json",
          "status",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.replace_pending_specialist_signup_challenge(uuid,text)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.specialist_signup_intents",
        "columns": [
          "id",
          "user_id",
          "challenge_id",
          "status",
          "organization_slug"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.report_saas_isolation_event(text,text,text,text)": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff",
      "app_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_event_hourly",
        "columns": [
          "event_id",
          "bucket_start",
          "occurrence_count"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_events",
        "columns": [
          "id",
          "fingerprint",
          "event_class",
          "source_service",
          "source_operation",
          "explanation_status",
          "lifecycle_status",
          "occurrence_count",
          "last_seen_at",
          "resolved_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.require_staff_security_self_user_id()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [],
    "delegatesTo": [
      "app.current_patient_user_id()"
    ],
    "invocation": "runtime"
  },
  "app.resolve_clinic_dedicated_bot_organization(text,text)": {
    "owner": "app_seam_dedicated_bot_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_integrator_resolver"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_dedicated_bot_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.clinic_dedicated_bot_bindings",
        "columns": [
          "channel",
          "organization_id",
          "credential_fingerprint",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_current_patient_treatment_program_organization(uuid)": {
    "owner": "app_seam_patient_program_resolver_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_program_resolver_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.treatment_program_instances",
        "columns": [
          "id",
          "patient_user_id",
          "status",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_operator_probe_incidents(text)": {
    "owner": "app_seam_telemetry_operator_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_scheduler"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_telemetry_operator_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id",
          "dedup_key",
          "resolved_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_organization_cabinet_access(uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.admin_audit_log",
        "columns": [
          "id",
          "action",
          "target_id",
          "details",
          "status",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "created_at",
          "tariff_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "current_period_ends_at",
          "grace_ends_at",
          "read_only_ends_at",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "ends_at",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_paid_period_policy",
        "columns": [
          "key",
          "post_paid_period_behavior",
          "post_paid_period_tariff_id",
          "is_active",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_organization_mechanic_access(uuid,text)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.admin_audit_log",
        "columns": [
          "id",
          "action",
          "target_id",
          "details",
          "status",
          "created_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "created_at",
          "tariff_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "current_period_ends_at",
          "grace_ends_at",
          "read_only_ends_at",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_org_entitlement_overrides",
        "columns": [
          "id",
          "organization_id",
          "mechanic",
          "enabled",
          "created_at",
          "expires_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "ends_at",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "status",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_paid_period_policy",
        "columns": [
          "key",
          "post_paid_period_behavior",
          "post_paid_period_tariff_id",
          "is_active",
          "created_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_outgoing_delivery_scope(uuid)": {
    "owner": "app_seam_delivery_scope_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_delivery_scope_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.broadcast_audit",
        "columns": [
          "id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.operator_incidents",
        "columns": [
          "id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "payload_json",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_payment_webhook_organization(text,text,text)": {
    "owner": "app_seam_payment_webhook_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_payment_webhook_owner",
    "typedArgs": [
      "text",
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_payment_intents",
        "columns": [
          "organization_id",
          "idempotency_key",
          "provider_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_payment_provider_events",
        "columns": [
          "organization_id",
          "provider_id",
          "idempotency_key",
          "event_type"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_public_booking_organization(uuid,uuid,uuid)": {
    "owner": "app_seam_public_booking_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_public_booking_owner",
    "typedArgs": [
      "uuid",
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_branches",
        "columns": [
          "id",
          "organization_id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_clinic_services",
        "columns": [
          "id",
          "organization_id",
          "is_active",
          "public_widget_visible",
          "admin_manual_only"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_external_entity_mappings",
        "columns": [
          "id",
          "organization_id",
          "entity_type",
          "canonical_id",
          "metadata"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_specialist_service_availability",
        "columns": [
          "id",
          "organization_id",
          "service_id",
          "branch_id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_public_organization_by_slug(text)": {
    "owner": "app_seam_public_slug_owner",
    "security": "DEFINER",
    "returns": "uuid",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_public_slug_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [],
    "delegatesTo": [
      "app.resolve_public_organization_slug(text)"
    ],
    "invocation": "runtime"
  },
  "app.resolve_public_organization_slug(text)": {
    "owner": "app_seam_public_slug_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_public_slug_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.clinic_public_directory_entries",
        "columns": [
          "organization_id",
          "slug",
          "is_published"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.organization_slug_claims",
        "columns": [
          "id",
          "slug",
          "kind",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.resolve_saas_billing_invoice_for_webhook(text,text)": {
    "owner": "app_seam_payment_webhook_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_payment_webhook_owner",
    "typedArgs": [
      "text",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_billing_invoices",
        "columns": [
          "id",
          "organization_id",
          "amount_minor",
          "currency",
          "provider_id",
          "provider_invoice_ref"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.revalidate_appointment_reminder_materialization(uuid)": {
    "owner": "app_seam_reminder_appointment_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_appointment_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.be_appointments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "start_at",
          "status",
          "updated_at",
          "deleted_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "dead_at",
          "last_error",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "updated_at",
          "is_blocked",
          "is_archived",
          "merged_into_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id",
          "bot_blocked_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "is_enabled_for_notifications",
          "updated_at",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topics",
        "columns": [
          "user_id",
          "topic_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.revalidate_patient_reminder_delivery_materialization(uuid)": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "status",
          "organization_id",
          "platform_user_id",
          "delivery_generation"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "event_id",
          "kind",
          "channel",
          "payload_json",
          "status",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "email",
          "email_verified_at",
          "is_blocked",
          "is_archived",
          "merged_into_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_journal",
        "columns": [
          "id",
          "rule_id",
          "occurrence_id",
          "action",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "is_enabled",
          "notification_topic_code",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id",
          "bot_blocked_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "is_enabled_for_notifications",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topics",
        "columns": [
          "user_id",
          "topic_code",
          "is_enabled"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.revalidate_specialist_task_reminder_materialization(uuid)": {
    "owner": "app_seam_reminder_specialist_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_specialist_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.outgoing_delivery_queue",
        "columns": [
          "id",
          "kind",
          "payload_json",
          "status",
          "next_retry_at",
          "last_error",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.revoke_staff_sessions()": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "session_version",
          "login_challenge_hash",
          "login_challenge_expires_at",
          "updated_at"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.saas_billing_effective_tariff_for_current_org(uuid,uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "saas_tariffs",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_clinic_billing",
      "app_patient",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [],
    "delegatesTo": [
      "app.current_org_id()",
      "app.saas_billing_effective_tariff(uuid,uuid)"
    ],
    "invocation": "runtime"
  },
  "app.saas_billing_effective_tariff(uuid,uuid)": {
    "owner": "app_seam_org_commerce_owner",
    "security": "DEFINER",
    "returns": "saas_tariffs",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_org_commerce_owner",
    "typedArgs": [
      "uuid",
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_billing_subscriptions",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "status",
          "current_period_starts_at",
          "current_period_ends_at",
          "tariff_snapshot"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_tariffs",
        "columns": [
          "id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.save_clinical_test_measure_kinds(jsonb)": {
    "owner": "app_seam_catalog_admin_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_catalog_admin_owner",
    "typedArgs": [
      "jsonb"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.clinical_test_measure_kinds",
        "columns": [
          "id",
          "code",
          "label",
          "sort_order"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.save_pending_staff_totp(text)": {
    "owner": "app_seam_staff_security_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_staff_security_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.staff_security_profiles",
        "columns": [
          "user_id",
          "pending_totp_secret_ciphertext",
          "failed_attempts",
          "locked_until",
          "updated_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.seed_reference_catalog_after_organization_insert()": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "trigger",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [],
    "delegatesTo": [
      "app.seed_reference_catalog_snapshot(uuid)"
    ],
    "invocation": "trigger"
  },
  "app.seed_reference_catalog_snapshot(uuid)": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "integer",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.reference_catalog_baselines",
        "columns": [
          "version",
          "definition_json"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reference_catalog_snapshot_receipts",
        "columns": [
          "organization_id",
          "baseline_version"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reference_categories",
        "columns": [
          "id",
          "code",
          "title",
          "is_user_extensible",
          "organization_id"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reference_items",
        "columns": [
          "id",
          "category_id",
          "code",
          "title",
          "sort_order",
          "is_active",
          "meta_json",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.set_current_patient_calendar_timezone(text,boolean)": {
    "owner": "app_seam_patient_self_actions_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_self_actions_owner",
    "typedArgs": [
      "text",
      "boolean"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "role",
          "updated_at",
          "merged_into_id",
          "calendar_timezone"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.set_saas_isolation_test_scenario(text)": {
    "owner": "saas_telemetry_owner",
    "security": "DEFINER",
    "returns": "void",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "saas_telemetry_operator"
    ],
    "purpose": "evidence/25+30 narrow seam owned by saas_telemetry_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test"
    ],
    "relationSurfaces": [
      {
        "relation": "public.saas_isolation_coverage_runs",
        "columns": [
          "id",
          "status",
          "started_at",
          "finished_at",
          "services_checked",
          "checks_count",
          "unexpected_errors_count"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_event_hourly",
        "columns": [
          "event_id",
          "bucket_start",
          "occurrence_count"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_isolation_events",
        "columns": [
          "id",
          "fingerprint",
          "event_class",
          "source_service",
          "source_operation",
          "explanation_status",
          "lifecycle_status",
          "occurrence_count",
          "first_seen_at",
          "last_seen_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.set_staff_security_self_password_hash(text)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_pre_session"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id",
          "password_hash",
          "updated_at",
          "failed_attempts",
          "locked_until"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.specialist_task_reminder_materialization_fingerprint(uuid)": {
    "owner": "app_seam_reminder_specialist_owner",
    "security": "DEFINER",
    "returns": "text",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_operational_delivery_worker"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_specialist_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "created_at",
          "updated_at",
          "email",
          "email_verified_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.specialist_tasks",
        "columns": [
          "id",
          "owner_user_id",
          "patient_user_id",
          "title",
          "description",
          "due_at",
          "remind_at",
          "is_important",
          "completed_at",
          "reminder_sent_at",
          "created_at",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.system_settings",
        "columns": [
          "key",
          "scope",
          "value_json",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_bindings",
        "columns": [
          "user_id",
          "channel_code",
          "external_id",
          "created_at",
          "bot_blocked_at",
          "bot_blocked_reason"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_channel_preferences",
        "columns": [
          "id",
          "user_id",
          "channel_code",
          "is_enabled_for_messages",
          "is_enabled_for_notifications",
          "created_at",
          "updated_at",
          "platform_user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_notification_topic_channels",
        "columns": [
          "user_id",
          "topic_code",
          "channel_code",
          "is_enabled",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.user_web_push_subscriptions",
        "columns": [
          "id",
          "user_id",
          "endpoint",
          "p256dh",
          "auth",
          "created_at",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.staff_user_has_password_credentials(uuid)": {
    "owner": "app_seam_password_auth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_password_auth_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_password_credentials",
        "columns": [
          "user_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.staff_user_has_web_oauth_binding(uuid)": {
    "owner": "app_seam_oauth_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "STABLE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_oauth_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.user_oauth_bindings",
        "columns": [
          "user_id",
          "provider"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.start_patient_invite_email_proof(text,text,text,timestamp with time zone,text,bigint,text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "timestamp with time zone",
      "text",
      "bigint",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "app.context_signing_secrets",
        "columns": [
          "id",
          "secret"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "status",
          "invited_email_normalized",
          "expires_at",
          "continuation_hash",
          "continuation_expires_at",
          "proof_email_normalized",
          "proof_code_hash",
          "proof_started_at",
          "proof_expires_at",
          "proof_attempts",
          "proof_verified_at",
          "updated_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.start_provisioned_organization_trial()": {
    "owner": "app_seam_specialist_provision_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_specialist_provision_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.admin_audit_log",
        "columns": [
          "id",
          "actor_id",
          "action",
          "target_id",
          "details",
          "status",
          "organization_id"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at",
          "tariff_id"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_organization_trials",
        "columns": [
          "id",
          "organization_id",
          "tariff_id",
          "started_at",
          "ends_at",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "status",
          "created_by",
          "updated_at",
          "discount_ends_at"
        ],
        "operations": [
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_registration_tariff_policy",
        "columns": [
          "key",
          "tariff_id",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_tariffs",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.saas_trial_policy",
        "columns": [
          "key",
          "duration_days",
          "start_event",
          "post_trial_behavior",
          "post_trial_tariff_id",
          "is_active",
          "updated_at",
          "discount_window_days"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.sync_clinic_dedicated_bot_binding()": {
    "owner": "app_seam_dedicated_bot_owner",
    "security": "DEFINER",
    "returns": "trigger",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_dedicated_bot_owner",
    "typedArgs": [],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.clinic_dedicated_bot_bindings",
        "columns": [
          "channel",
          "organization_id",
          "credential_fingerprint",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT",
          "INSERT",
          "DELETE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "trigger"
  },
  "app.touch_current_patient_plan_last_opened(uuid)": {
    "owner": "app_seam_patient_self_actions_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_self_actions_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.treatment_program_instances",
        "columns": [
          "id",
          "patient_user_id",
          "status",
          "updated_at",
          "patient_plan_last_opened_at",
          "organization_id"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.touch_current_patient_support_conversation_activity(uuid)": {
    "owner": "app_seam_patient_self_actions_owner",
    "security": "DEFINER",
    "returns": "boolean",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_self_actions_owner",
    "typedArgs": [
      "uuid"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.org_enrollments",
        "columns": [
          "id",
          "organization_id",
          "platform_user_id",
          "status"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.support_conversation_messages",
        "columns": [
          "id",
          "conversation_id",
          "sender_role",
          "text",
          "source",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.support_conversations",
        "columns": [
          "id",
          "platform_user_id",
          "source",
          "admin_scope",
          "status",
          "last_message_at",
          "closed_at",
          "updated_at",
          "organization_id"
        ],
        "operations": [
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.upsert_clinical_test_measure_kind_by_label(text)": {
    "owner": "app_seam_catalog_admin_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_platform_settings",
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_catalog_admin_owner",
    "typedArgs": [
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "public.clinical_test_measure_kinds",
        "columns": [
          "id",
          "code",
          "label",
          "sort_order"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.upsert_patient_reminder_occurrence_plan(text,text,uuid,uuid,text,timestamp with time zone)": {
    "owner": "app_seam_reminder_materialization_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_staff"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_reminder_materialization_owner",
    "typedArgs": [
      "text",
      "text",
      "uuid",
      "uuid",
      "text",
      "timestamp with time zone"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "integrator.user_reminder_occurrences",
        "columns": [
          "id",
          "rule_id",
          "occurrence_key",
          "planned_at",
          "status",
          "created_at",
          "updated_at",
          "organization_id",
          "platform_user_id",
          "delivery_generation"
        ],
        "operations": [
          "SELECT",
          "INSERT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.platform_users",
        "columns": [
          "id",
          "created_at",
          "updated_at",
          "is_blocked",
          "is_archived",
          "merged_into_id",
          "reminder_muted_until"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.reminder_rules",
        "columns": [
          "id",
          "integrator_rule_id",
          "platform_user_id",
          "is_enabled",
          "updated_at",
          "created_at",
          "notification_topic_code",
          "organization_id"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  },
  "app.verify_patient_invite_email_proof(text,text,text,text,bigint,text)": {
    "owner": "app_seam_patient_invite_owner",
    "security": "DEFINER",
    "returns": "record",
    "volatility": "VOLATILE",
    "parallel": "UNSAFE",
    "proconfig": [
      "search_path=pg_catalog"
    ],
    "execute": [
      "app_patient"
    ],
    "purpose": "evidence/25+30 narrow seam owned by app_seam_patient_invite_owner",
    "typedArgs": [
      "text",
      "text",
      "text",
      "text",
      "bigint",
      "text"
    ],
    "databases": [
      "bersoncarebot_test",
      "bcb_webapp_dev"
    ],
    "relationSurfaces": [
      {
        "relation": "app.context_signing_secrets",
        "columns": [
          "id",
          "secret"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.be_organizations",
        "columns": [
          "id",
          "is_active",
          "updated_at"
        ],
        "operations": [
          "SELECT"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      },
      {
        "relation": "public.patient_invites",
        "columns": [
          "id",
          "organization_id",
          "patient_user_id",
          "status",
          "invited_email_normalized",
          "expires_at",
          "accepted_by_platform_user_id",
          "accepted_via",
          "continuation_hash",
          "continuation_expires_at",
          "proof_email_normalized",
          "proof_code_hash",
          "proof_expires_at",
          "proof_attempts",
          "proof_verified_at",
          "updated_at",
          "recipient_binding"
        ],
        "operations": [
          "SELECT",
          "UPDATE"
        ],
        "evidence": "pg16-function-body-lexical-upper-bound"
      }
    ],
    "invocation": "runtime"
  }
};

export const BUSINESS_SEAM_STATS = {
  functions: Object.keys(BUSINESS_SEAM_FUNCTIONS).length,
  owners: new Set(Object.values(BUSINESS_SEAM_FUNCTIONS).map((entry) => entry.owner)).size,
  test: Object.values(BUSINESS_SEAM_FUNCTIONS).filter((entry) => entry.databases?.includes('bersoncarebot_test')).length,
  dev: Object.values(BUSINESS_SEAM_FUNCTIONS).filter((entry) => entry.databases?.includes('bcb_webapp_dev')).length,
  triggers: Object.values(BUSINESS_SEAM_FUNCTIONS).filter((entry) => entry.invocation === 'trigger').length,
  relationEdges: Object.values(BUSINESS_SEAM_FUNCTIONS).reduce((count, entry) => count + (entry.relationSurfaces?.length ?? 0), 0),
} as const;
