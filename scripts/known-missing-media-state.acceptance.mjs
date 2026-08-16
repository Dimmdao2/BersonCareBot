#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveTrustedPostgresBinaries,
  SAFE_OPERATOR_PATH,
} from './a0-greenfield-baseline-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetIds = ['02080664-88fd-4430-a94f-0b533b0fea36', '015dcea9-8793-46a1-8c90-a78b2f3707d7'];
const healthyId = '1ef434ef-0781-4f62-afcb-59bc260842cc';
const migrationSql = fs.readFileSync(
  path.join(
    root,
    'apps/webapp/db/drizzle-migrations/0448_known_missing_discussion_media_state_local.sql',
  ),
  'utf8',
);
const cutoverSql = fs.readFileSync(
  path.join(root, 'deploy/postgres/prod-to-target-cutover-known-missing-media.sql'),
  'utf8',
);

function cleanEnv() {
  return { PATH: SAFE_OPERATOR_PATH, LANG: 'C.UTF-8' };
}

function run(bin, args, input, label) {
  const result = spawnSync(bin, args, {
    input,
    encoding: 'utf8',
    env: cleanEnv(),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.stderr || result.error?.message || result.status}`);
  }
  return result.stdout;
}

function fixtureSql({ wrongIdentity = false } = {}) {
  return `
DROP TABLE IF EXISTS public.program_item_discussion_messages;
DROP TABLE IF EXISTS public.media_files;
CREATE TABLE public.media_files (
  id uuid PRIMARY KEY,
  original_name text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  s3_key text,
  status text NOT NULL,
  preview_status text NOT NULL,
  preview_sm_key text,
  preview_md_key text,
  preview_next_attempt_at timestamptz,
  audit_marker jsonb NOT NULL
);
CREATE TABLE public.program_item_discussion_messages (
  id uuid PRIMARY KEY,
  media_file_id uuid,
  body text,
  audit_marker jsonb NOT NULL
);
INSERT INTO public.media_files VALUES
  ('${targetIds[0]}', '${wrongIdentity ? 'unexpected.png' : 'IMG_7795.png'}', 'media/lost-one', 'image/png', 10, 'media/lost-one', 'ready', 'ready', 'previews/lost-one-sm.jpg', 'previews/lost-one-md.jpg', now(), '{"kept":1}'),
  ('${targetIds[1]}', 'image.jpg', 'media/lost-two', 'image/jpeg', 20, 'media/lost-two', 'ready', 'ready', 'previews/lost-two-sm.jpg', 'previews/lost-two-md.jpg', now(), '{"kept":2}'),
  ('${healthyId}', 'image.jpg', 'media/healthy', 'image/jpeg', 30, 'media/healthy', 'ready', 'ready', 'previews/healthy-sm.jpg', 'previews/healthy-md.jpg', now(), '{"kept":3}');
INSERT INTO public.program_item_discussion_messages VALUES
  ('10000000-0000-4000-8000-000000000001', '${targetIds[0]}', 'first', '{"kept":1}'),
  ('10000000-0000-4000-8000-000000000002', '${targetIds[1]}', 'second', '{"kept":2}'),
  ('10000000-0000-4000-8000-000000000003', '${healthyId}', 'healthy', '{"kept":3}');
`;
}

function main() {
  const {
    initdb,
    pg_ctl: pgCtl,
    psql,
  } = resolveTrustedPostgresBinaries(['initdb', 'pg_ctl', 'psql']);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_missing_media_gate_'));
  const data = path.join(scratch, 'data');
  const socket = path.join(scratch, 'socket');
  const log = path.join(scratch, 'postgres.log');
  const port = String(47000 + Math.floor(Math.random() * 1000));
  fs.mkdirSync(socket, { mode: 0o700 });
  let started = false;

  try {
    run(
      initdb,
      ['-D', data, '--username=media_gate', '--auth=trust', '--no-locale'],
      undefined,
      'initdb',
    );
    run(
      pgCtl,
      [
        '-D',
        data,
        '-o',
        `-F -k ${socket} -p ${port} -c listen_addresses=''`,
        '-w',
        'start',
        '-l',
        log,
      ],
      undefined,
      'pg_ctl start',
    );
    started = true;
    const base = [
      '-X',
      '-h',
      socket,
      '-p',
      port,
      '-U',
      'media_gate',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ];
    const exec = (sql, label) => run(psql, base, sql, label);
    const scalar = (sql) => run(psql, [...base, '-Atqc', sql], undefined, 'query').trim();

    const verifyBehavior = (productSql, label) => {
      exec(fixtureSql(), `${label} fixture`);
      const healthyBefore = scalar(
        `SELECT to_jsonb(media)::text FROM public.media_files media WHERE id='${healthyId}'`,
      );
      const metadataBefore = scalar(
        `SELECT jsonb_agg(to_jsonb(media) - ARRAY['preview_status','preview_sm_key','preview_md_key','preview_next_attempt_at'] ORDER BY id)::text FROM public.media_files media WHERE id IN ('${targetIds[0]}','${targetIds[1]}')`,
      );
      const referencesBefore = scalar(
        `SELECT jsonb_agg(to_jsonb(message) ORDER BY id)::text FROM public.program_item_discussion_messages message`,
      );

      exec(productSql, `${label} first apply`);
      assert.equal(
        scalar(
          `SELECT count(*) FROM public.media_files WHERE id IN ('${targetIds[0]}','${targetIds[1]}') AND preview_status='failed' AND preview_sm_key IS NULL AND preview_md_key IS NULL AND preview_next_attempt_at IS NULL`,
        ),
        '2',
        `${label}: exact two target rows`,
      );
      assert.equal(
        scalar(
          `SELECT to_jsonb(media)::text FROM public.media_files media WHERE id='${healthyId}'`,
        ),
        healthyBefore,
        `${label}: healthy row unchanged`,
      );
      assert.equal(
        scalar(
          `SELECT jsonb_agg(to_jsonb(media) - ARRAY['preview_status','preview_sm_key','preview_md_key','preview_next_attempt_at'] ORDER BY id)::text FROM public.media_files media WHERE id IN ('${targetIds[0]}','${targetIds[1]}')`,
        ),
        metadataBefore,
        `${label}: audit metadata preserved`,
      );
      assert.equal(
        scalar(
          `SELECT jsonb_agg(to_jsonb(message) ORDER BY id)::text FROM public.program_item_discussion_messages message`,
        ),
        referencesBefore,
        `${label}: references preserved`,
      );

      exec(productSql, `${label} idempotent apply`);
      assert.equal(
        scalar(`SELECT count(*) FROM public.media_files WHERE preview_status='failed'`),
        '2',
        `${label}: idempotent target count`,
      );
    };

    verifyBehavior(migrationSql, 'forward migration');
    verifyBehavior(cutoverSql, 'cutover correction');

    exec(fixtureSql({ wrongIdentity: true }), 'identity-drift fixture');
    const failed = spawnSync(psql, base, {
      input: migrationSql,
      encoding: 'utf8',
      env: cleanEnv(),
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.notEqual(failed.status, 0, 'unexpected identity must fail closed');
    assert.match(failed.stderr, /known missing discussion media identity\/state drift/u);
    assert.equal(
      scalar(
        `SELECT count(*) FROM public.media_files WHERE id IN ('${targetIds[0]}','${targetIds[1]}') AND preview_status='ready'`,
      ),
      '2',
      'identity failure mutated a target row',
    );

    console.log('known missing media state acceptance: PASS');
  } finally {
    if (started) {
      spawnSync(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], {
        env: cleanEnv(),
        stdio: 'ignore',
      });
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
