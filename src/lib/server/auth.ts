import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { query, queryOne, execute, insertReturningId } from './db.js';

export interface User {
	id: number;
	email: string;
	role: 'admin' | 'user';
}

export interface Session {
	id: string;
	userId: number;
	expiresAt: Date;
}

const SESSION_TTL_DAYS = 30;

// --- User ---

export async function getUserByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
	return queryOne<User & { password_hash: string }>(
		'SELECT id, email, role, password_hash FROM users WHERE email = ?',
		[email.trim().toLowerCase()]
	);
}

export async function getUserById(id: number): Promise<User | null> {
	return queryOne<User>('SELECT id, email, role FROM users WHERE id = ?', [id]);
}

export async function countUsers(): Promise<number> {
	const row = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM users');
	return Number(row?.n ?? 0);
}

export async function createUser(email: string, password: string, role: 'admin' | 'user'): Promise<User> {
	const normalizedEmail = email.trim().toLowerCase();
	const password_hash = await hash(password);
	const id = await insertReturningId(
		'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id',
		[normalizedEmail, password_hash, role]
	);
	return { id, email: normalizedEmail, role };
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
	return verify(hashed, plain);
}

let dummyHash: Promise<string> | null = null;

/** Always performs one Argon2 verification so unknown emails do not get a fast timing path. */
export async function verifyLoginPassword(plain: string, hashed?: string): Promise<boolean> {
	if (!dummyHash) dummyHash = hash(randomBytes(24).toString('hex'));
	return verify(hashed ?? (await dummyHash), plain);
}

// --- Session ---

export async function createSession(userId: number): Promise<Session> {
	const id = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
	await execute('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
		id,
		userId,
		expiresAt
	]);
	return { id, userId, expiresAt };
}

export async function getSession(id: string): Promise<(Session & { user: User }) | null> {
	const row = await queryOne<{
		id: string;
		user_id: number;
		expires_at: Date;
		email: string;
		role: string;
	}>(
		`SELECT s.id, s.user_id, s.expires_at, u.email, u.role
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.id = ? AND s.expires_at > NOW()`,
		[id]
	);
	if (!row) return null;
	return {
		id: row.id,
		userId: row.user_id,
		expiresAt: row.expires_at,
		user: { id: row.user_id, email: row.email, role: row.role as User['role'] }
	};
}

export async function deleteSession(id: string): Promise<void> {
	await execute('DELETE FROM sessions WHERE id = ?', [id]);
}

export async function pruneExpiredSessions(): Promise<void> {
	await execute('DELETE FROM sessions WHERE expires_at < NOW()');
}
