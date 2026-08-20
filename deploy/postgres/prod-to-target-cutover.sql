\set ON_ERROR_STOP on

-- One transactional A -> B schema migration. The caller performs the reviewed
-- data preparation first; this entrypoint replaces the historical migration chain.
\ir prod-to-target-cutover-start.sql
\ir generated/prod-to-target/schema-pre.sql
\ir prod-to-target-cutover-data.sql
\ir generated/prod-to-target/ledgers-and-baseline.sql
\ir generated/prod-to-target/runtime-settings.sql
\ir generated/prod-to-target/schema-post.sql
\ir prod-to-target-cutover-finish.sql
