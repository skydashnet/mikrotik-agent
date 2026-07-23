import { createRouterClient, type RouterOsClient, type RouterOsCommand, type RouterOsRow } from './index.js';
import { queryOne } from '../db.js';
import { decrypt } from '../crypto.js';
import type { Router } from '../routers.js';

// Connection manager.
// Goal: avoid login/logout spam in RouterOS logs by holding ONE persistent
// connection per router and reusing it, instead of connecting per command.
//
// - Per-router mutex: the v6 binary API allows one in-flight command per socket
//   (we don't use command tags), so calls are serialized to prevent reply interleave.
// - Idle sweep: connections unused for IDLE_MS are closed to free sockets.
// - Reconnect: ApiClient reconnects itself on a dead socket (see api.ts).

const IDLE_MS = 5 * 60_000; // close a router connection after 5 min idle
const SWEEP_MS = 60_000;

interface Entry {
	userId: number;
	client: RouterOsClient;
	lastUsed: number;
	// Serializes commands on this router (chained promise = simple async mutex).
	lock: Promise<unknown>;
}

const pool = new Map<number, Entry>();
const pending = new Map<number, { userId: number; promise: Promise<Entry> }>();
const statusCache = new Map<number, { userId: number; value: RouterStatus }>();
const statusPending = new Map<number, { userId: number; promise: Promise<RouterStatus> }>();
const statusEpoch = new Map<number, number>();
let sweeper: ReturnType<typeof setInterval> | null = null;

export interface RouterStatus {
	ok: boolean;
	version?: string;
	error?: string;
	checkedAt: number;
}

function startSweeper(): void {
	if (sweeper) return;
	sweeper = setInterval(() => {
		const now = Date.now();
		for (const [id, e] of pool) {
			if (now - e.lastUsed > IDLE_MS) {
				pool.delete(id);
				e.client.close().catch(() => {});
			}
		}
		if (pool.size === 0 && sweeper) {
			clearInterval(sweeper);
			sweeper = null;
		}
	}, SWEEP_MS);
	// Don't keep the process alive just for the sweeper.
	if (typeof sweeper.unref === 'function') sweeper.unref();
}

// Load router row (with encrypted credential) scoped to the owner.
async function loadRouter(userId: number, routerId: number): Promise<(Router & { password_enc: string }) | null> {
	return queryOne<Router & { password_enc: string }>(
		`SELECT id, user_id, name, host, transport, port, use_tls, username, password_enc, created_at
		 FROM routers WHERE id = ? AND user_id = ?`,
		[routerId, userId]
	);
}

async function getEntry(userId: number, routerId: number): Promise<Entry> {
	const existing = pool.get(routerId);
	if (existing && existing.userId !== userId) throw new Error('Router not found');
	if (existing && existing.client.isAlive) {
		existing.lastUsed = Date.now();
		return existing;
	}
	// Drop a dead client if present.
	if (existing) {
		pool.delete(routerId);
		existing.client.close().catch(() => {});
	}
	const loading = pending.get(routerId);
	if (loading) {
		if (loading.userId !== userId) throw new Error('Router not found');
		return loading.promise;
	}

	const promise = (async () => {
		const row = await loadRouter(userId, routerId);
		if (!row) throw new Error('Router not found');
		const client = createRouterClient(row.transport, {
			host: row.host,
			port: row.port ?? undefined,
			useTls: !!row.use_tls,
			username: row.username,
			password: decrypt(row.password_enc)
		});
		const entry: Entry = { userId, client, lastUsed: Date.now(), lock: Promise.resolve() };
		pool.set(routerId, entry);
		startSweeper();
		return entry;
	})();
	pending.set(routerId, { userId, promise });
	try {
		return await promise;
	} finally {
		if (pending.get(routerId)?.promise === promise) pending.delete(routerId);
	}
}

/**
 * Run a command against a router using the pooled, serialized connection.
 * Ownership is enforced via userId (only the router's owner can reach it).
 */
export async function runCommand(
	userId: number,
	routerId: number,
	cmd: RouterOsCommand
): Promise<RouterOsRow[]> {
	const entry = await getEntry(userId, routerId);
	// Chain onto the lock so commands on the same router never overlap.
	const run = entry.lock.then(async () => {
		entry.lastUsed = Date.now();
		const rows = await entry.client.execute(cmd);
		entry.lastUsed = Date.now();
		return rows;
	});
	// Keep the chain alive even if this call rejects.
	entry.lock = run.catch(() => {});
	return run;
}

/** Test connectivity via the pool (also warms the connection). */
async function performRouterTest(
	userId: number,
	routerId: number
): Promise<{ ok: boolean; version?: string }> {
	const entry = await getEntry(userId, routerId);
	const run = entry.lock.then(async () => {
		entry.lastUsed = Date.now();
		const r = await entry.client.testConnection();
		entry.lastUsed = Date.now();
		return r;
	});
	entry.lock = run.catch(() => {});
	return run;
}

/**
 * Read a live RouterOS status with short server-side caching. The shared cache
 * prevents several open dashboards from issuing duplicate health commands.
 */
export async function getRouterStatus(
	userId: number,
	routerId: number,
	options: { force?: boolean; maxAgeMs?: number } = {}
): Promise<RouterStatus> {
	const maxAgeMs = options.maxAgeMs ?? 20_000;
	const cached = statusCache.get(routerId);
	if (cached && cached.userId !== userId) throw new Error('Router not found');
	if (!options.force && cached && Date.now() - cached.value.checkedAt < maxAgeMs) return cached.value;

	const existing = statusPending.get(routerId);
	if (existing) {
		if (existing.userId !== userId) throw new Error('Router not found');
		return existing.promise;
	}

	const epoch = statusEpoch.get(routerId) ?? 0;
	const promise = (async (): Promise<RouterStatus> => {
		let value: RouterStatus;
		try {
			const result = await performRouterTest(userId, routerId);
			value = { ...result, checkedAt: Date.now() };
		} catch (error) {
			value = {
				ok: false,
				error: error instanceof Error ? error.message : 'Tidak dapat terhubung',
				checkedAt: Date.now()
			};
		}
		if ((statusEpoch.get(routerId) ?? 0) === epoch) {
			statusCache.set(routerId, { userId, value });
		}
		return value;
	})();
	statusPending.set(routerId, { userId, promise });
	try {
		return await promise;
	} finally {
		if (statusPending.get(routerId)?.promise === promise) statusPending.delete(routerId);
	}
}

/** Force a fresh connectivity check for the manual test button. */
export async function testRouter(
	userId: number,
	routerId: number
): Promise<{ ok: boolean; version?: string }> {
	const status = await getRouterStatus(userId, routerId, { force: true });
	if (!status.ok) throw new Error(status.error || 'Tidak dapat terhubung');
	return { ok: true, version: status.version };
}

/** Force-close and drop a router's connection (e.g. on credential change/delete). */
export async function dropConnection(routerId: number): Promise<void> {
	statusEpoch.set(routerId, (statusEpoch.get(routerId) ?? 0) + 1);
	statusCache.delete(routerId);
	const e = pool.get(routerId);
	if (!e) return;
	pool.delete(routerId);
	await e.client.close().catch(() => {});
}
