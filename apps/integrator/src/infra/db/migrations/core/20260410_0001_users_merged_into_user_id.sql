-- Platform user merge v2 (Stage 1): alias pointer on integrator `users`.
-- Nullable = canonical row; non-null = alias → canonical `users.id`.
-- Application invariants (no writes to alias rows) are enforced in later stages.

ALTER TABLE users
  ADD COLUMN merged_into_user_id BIGINT NULL REFERENCES users (id);

ALTER TABLE users
  ADD CONSTRAINT users_merged_into_user_id_not_self_check
  CHECK (merged_into_user_id IS NULL OR merged_into_user_id <> id);

CREATE INDEX idx_users_merged_into_user_id
  ON users (merged_into_user_id)
  WHERE merged_into_user_id IS NOT NULL;
