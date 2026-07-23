import pg from 'pg';
import { env } from '$env/dynamic/private';

let pool: pg.Pool | null = null;

// The app contract uses numeric IDs. pg returns BIGINT as strings by default, which
// made router/session IDs silently change type between SSR and API requests.
// Reject values outside JS' safe range instead of leaking inconsistent types.
export function parseDbBigInt(value: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error(`BIGINT value exceeds JavaScript safe range: ${value}`);
	return parsed;
}

pg.types.setTypeParser(20, parseDbBigInt);

export function getPool(): pg.Pool {
	if (!pool) {
		pool = new pg.Pool({
			host: env.DB_HOST ?? '127.0.0.1',
			port: Number(env.DB_PORT ?? 5432),
			user: env.DB_USER ?? 'postgres',
			password: env.DB_PASSWORD || undefined,
			database: env.DB_NAME ?? 'mikrotik_manager',
			max: 10,
			connectionTimeoutMillis: 8_000,
			idleTimeoutMillis: 30_000
		});
	}
	return pool;
}

// Convert the codebase's portable `?` placeholders to Postgres `$1..$n`.
// Keeps all existing query strings untouched across the codebase.
function toPg(sql: string): string {
	let i = 0;
	return sql.replace(/\?/g, () => `$${++i}`);
}

export async function query<T = unknown>(sql: string, values: unknown[] = []): Promise<T[]> {
	const res = await getPool().query(toPg(sql), values);
	return res.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, values: unknown[] = []): Promise<T | null> {
	const rows = await query<T>(sql, values);
	return rows[0] ?? null;
}

// For UPDATE/DELETE (and INSERTs that don't need the id). Returns affected rows.
export async function execute(sql: string, values: unknown[] = []): Promise<{ rowCount: number }> {
	const res = await getPool().query(toPg(sql), values);
	return { rowCount: res.rowCount ?? 0 };
}

// INSERT ... RETURNING id returns the new row id.
export async function insertReturningId(sql: string, values: unknown[] = []): Promise<number> {
	const res = await getPool().query(toPg(sql), values);
	return Number(res.rows[0].id);
}
