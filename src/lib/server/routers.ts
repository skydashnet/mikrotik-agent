import { query, queryOne, execute, insertReturningId } from './db.js';
import { encrypt } from './crypto.js';
import type { Transport } from './routeros/index.js';

export interface Router {
	id: number;
	user_id: number;
	name: string;
	host: string;
	transport: Transport;
	port: number | null;
	use_tls: boolean;
	username: string;
	created_at: Date;
}

export interface RouterInput {
	name: string;
	host: string;
	transport: Transport;
	port?: number | null;
	useTls: boolean;
	username: string;
	password: string;
}

export interface RouterUpdateInput extends Omit<RouterInput, 'password'> {
	password?: string;
}

// Public list; never exposes credentials.
export async function listRouters(userId: number): Promise<Router[]> {
	return query<Router>(
		`SELECT id, user_id, name, host, transport, port, use_tls, username, created_at
		 FROM routers WHERE user_id = ? ORDER BY name`,
		[userId]
	);
}

export async function getRouter(userId: number, id: number): Promise<Router | null> {
	return queryOne<Router>(
		`SELECT id, user_id, name, host, transport, port, use_tls, username, created_at
		 FROM routers WHERE id = ? AND user_id = ?`,
		[id, userId]
	);
}

export async function createRouter(userId: number, input: RouterInput): Promise<number> {
	return insertReturningId(
		`INSERT INTO routers (user_id, name, host, transport, port, use_tls, username, password_enc)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		[
			userId,
			input.name,
			input.host,
			input.transport,
			input.port ?? null,
			input.useTls,
			input.username,
			encrypt(input.password)
		]
	);
}

export async function deleteRouter(userId: number, id: number): Promise<void> {
	await execute('DELETE FROM routers WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function updateRouter(userId: number, id: number, input: RouterUpdateInput): Promise<boolean> {
	const values: unknown[] = [
		input.name,
		input.host,
		input.transport,
		input.port ?? null,
		input.useTls,
		input.username
	];
	let passwordSql = '';
	if (input.password) {
		passwordSql = ', password_enc = ?';
		values.push(encrypt(input.password));
	}
	values.push(id, userId);
	const result = await execute(
		`UPDATE routers SET name = ?, host = ?, transport = ?, port = ?, use_tls = ?, username = ?${passwordSql}
		 WHERE id = ? AND user_id = ?`,
		values
	);
	return result.rowCount > 0;
}

// Live connections are obtained via the connection manager
// (src/lib/server/routeros/connection-manager.ts): runCommand() / testRouter().
// It pools + serializes per router to avoid RouterOS login/logout log spam.
