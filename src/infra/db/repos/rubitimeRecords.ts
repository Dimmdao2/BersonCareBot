import { db } from '../client.js';
import { logger } from '../../observability/logger.js';

/** Репозиторий Rubitime-записей и входящих Rubitime-событий. */
export type RubitimeRecordStatus = 'created' | 'updated' | 'canceled';

export type UpsertRubitimeRecordInput = {
	rubitimeRecordId: string;
	phoneNormalized: string | null;
	recordAt: string | Date | null;
	status: RubitimeRecordStatus;
	payloadJson: unknown;
	lastEvent: string;
};

export type InsertRubitimeEventInput = {
	rubitimeRecordId?: string | null;
	event: string;
	payloadJson: unknown;
};

export type RubitimeRecordRow = {
	id: string;
	rubitime_record_id: string;
	phone_normalized: string | null;
	record_at: Date | null;
	status: RubitimeRecordStatus;
	payload_json: unknown;
	last_event: string;
	created_at: Date;
	updated_at: Date;
};

export type RubitimeRecordForLinking = {
	rubitimeRecordId: string;
	phoneNormalized: string | null;
	payloadJson: unknown;
	recordAt: Date | null;
	status: RubitimeRecordStatus;
};

/** Создает или обновляет запись Rubitime по внешнему id. */
export async function upsertRecord(input: UpsertRubitimeRecordInput): Promise<void> {
	const query = `
		INSERT INTO rubitime_records (
			rubitime_record_id,
			phone_normalized,
			record_at,
			status,
			payload_json,
			last_event,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), NOW())
		ON CONFLICT (rubitime_record_id)
		DO UPDATE SET
			phone_normalized = EXCLUDED.phone_normalized,
			record_at = EXCLUDED.record_at,
			status = EXCLUDED.status,
			payload_json = EXCLUDED.payload_json,
			last_event = EXCLUDED.last_event,
			updated_at = NOW()
	`;

	const recordAt = input.recordAt instanceof Date ? input.recordAt.toISOString() : input.recordAt;
	try {
		await db.query(query, [
			input.rubitimeRecordId,
			input.phoneNormalized,
			recordAt,
			input.status,
			JSON.stringify(input.payloadJson),
			input.lastEvent,
		]);
	} catch (err) {
		logger.error({ err, rubitimeRecordId: input.rubitimeRecordId }, 'upsert rubitime record failed');
	}
}

/** Сохраняет сырой входящий Rubitime event в журнал. */
export async function insertEvent(input: InsertRubitimeEventInput): Promise<void> {
	const query = `
		INSERT INTO rubitime_events (
			rubitime_record_id,
			event,
			payload_json,
			received_at
		)
		VALUES ($1, $2, $3::jsonb, NOW())
	`;
	try {
		await db.query(query, [
			input.rubitimeRecordId ?? null,
			input.event,
			JSON.stringify(input.payloadJson),
		]);
	} catch (err) {
		logger.error({ err, event: input.event }, 'insert rubitime event failed');
	}
}

/** Возвращает запись Rubitime в форме для сценариев линковки пользователя. */
export async function getRecordByRubitimeId(
	rubitimeRecordId: string,
): Promise<RubitimeRecordForLinking | null> {
	const query = `
		SELECT
			rubitime_record_id,
			phone_normalized,
			payload_json,
			record_at,
			status
		FROM rubitime_records
		WHERE rubitime_record_id = $1
		LIMIT 1
	`;
	try {
		const res = await db.query<{
			rubitime_record_id: string;
			phone_normalized: string | null;
			payload_json: unknown;
			record_at: Date | null;
			status: RubitimeRecordStatus;
		}>(query, [rubitimeRecordId]);
		const row = res.rows[0];
		if (!row) return null;
		return {
			rubitimeRecordId: row.rubitime_record_id,
			phoneNormalized: row.phone_normalized,
			payloadJson: row.payload_json,
			recordAt: row.record_at,
			status: row.status,
		};
	} catch (err) {
		logger.error({ err, rubitimeRecordId }, 'get rubitime record by id failed');
		return null;
	}
}
