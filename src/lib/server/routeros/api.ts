import net from 'node:net';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import { isRouterOsPath } from './types.js';
import type {
	RouterOsClient,
	RouterOsCommand,
	RouterOsRow,
	RouterConnectionConfig
} from './types.js';

// RouterOS v6 binary API protocol (mikrotik-api).
// Protocol: messages ("sentences") are sequences of length-prefixed words,
// terminated by a zero-length word. Replies start with !re (data), !done, !trap (error), !fatal.
// Ref: https://help.mikrotik.com/docs/display/ROS/API

const CONNECT_TIMEOUT_MS = 8000;
const REPLY_TIMEOUT_MS = 15000;

export function encodeLength(len: number): Buffer {
	if (!Number.isInteger(len) || len < 0 || len > 0xffffffff) {
		throw new RangeError('RouterOS word length must be an unsigned 32-bit integer');
	}
	if (len < 0x80) return Buffer.from([len]);
	if (len < 0x4000) {
		const b = Buffer.alloc(2);
		b.writeUInt16BE(len | 0x8000);
		return b;
	}
	if (len < 0x200000) {
		const b = Buffer.alloc(3);
		b[0] = (len >> 16) | 0xc0;
		b[1] = (len >> 8) & 0xff;
		b[2] = len & 0xff;
		return b;
	}
	if (len < 0x10000000) {
		const b = Buffer.alloc(4);
		// Bitwise operators return signed int32; convert back to uint32 for Buffer.
		b.writeUInt32BE((len | 0xe0000000) >>> 0);
		return b;
	}
	const b = Buffer.alloc(5);
	b[0] = 0xf0;
	b.writeUInt32BE(len, 1);
	return b;
}

function encodeWord(word: string): Buffer {
	const data = Buffer.from(word, 'utf8');
	return Buffer.concat([encodeLength(data.length), data]);
}

function encodeSentence(words: string[]): Buffer {
	return Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
}

// Incremental parser: feed bytes, pull complete sentences.
export class SentenceParser {
	private buf = Buffer.alloc(0);

	push(chunk: Buffer): void {
		this.buf = Buffer.concat([this.buf, chunk]);
	}

	// Returns next complete sentence (array of words) or null if incomplete.
	next(): string[] | null {
		const words: string[] = [];
		let offset = 0;
		while (true) {
			const lenInfo = this.readLength(offset);
			if (!lenInfo) return null; // incomplete length prefix
			const { length, bytes } = lenInfo;
			offset += bytes;
			if (length === 0) {
				// end of sentence
				this.buf = this.buf.subarray(offset);
				return words;
			}
			if (this.buf.length < offset + length) return null; // incomplete word
			words.push(this.buf.subarray(offset, offset + length).toString('utf8'));
			offset += length;
		}
	}

	private readLength(offset: number): { length: number; bytes: number } | null {
		if (this.buf.length <= offset) return null;
		const c = this.buf[offset];
		if ((c & 0x80) === 0) return { length: c, bytes: 1 };
		if ((c & 0xc0) === 0x80) {
			if (this.buf.length < offset + 2) return null;
			return { length: ((c & 0x3f) << 8) | this.buf[offset + 1], bytes: 2 };
		}
		if ((c & 0xe0) === 0xc0) {
			if (this.buf.length < offset + 3) return null;
			return {
				length: ((c & 0x1f) << 16) | (this.buf[offset + 1] << 8) | this.buf[offset + 2],
				bytes: 3
			};
		}
		if ((c & 0xf0) === 0xe0) {
			if (this.buf.length < offset + 4) return null;
			return {
				length:
					((c & 0x0f) << 24) |
					(this.buf[offset + 1] << 16) |
					(this.buf[offset + 2] << 8) |
					this.buf[offset + 3],
				bytes: 4
			};
		}
		// 0xf0 prefix: next 4 bytes are the length
		if (this.buf.length < offset + 5) return null;
		return { length: this.buf.readUInt32BE(offset + 1), bytes: 5 };
	}
}

export class ApiClient implements RouterOsClient {
	private cfg: RouterConnectionConfig;
	private socket: net.Socket | tls.TLSSocket | null = null;
	private parser = new SentenceParser();

	constructor(cfg: RouterConnectionConfig) {
		this.cfg = cfg;
	}

	/** True while the socket is open and logged in. */
	get isAlive(): boolean {
		return this.socket !== null && !this.socket.destroyed;
	}

	private markDead(): void {
		this.socket = null;
		this.parser = new SentenceParser();
	}

	private async connect(): Promise<void> {
		if (this.isAlive) return;
		if (this.socket) this.markDead(); // stale/destroyed; reset before reconnect
		const port = this.cfg.port ?? (this.cfg.useTls ? 8729 : 8728);
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			let socket: net.Socket | tls.TLSSocket;
			const fail = (e: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				socket?.destroy();
				if (this.socket === socket) this.markDead();
				reject(e);
			};
			const onErr = (e: Error) => fail(e);
			const timer = setTimeout(() => fail(new Error('RouterOS API connect timeout')), CONNECT_TIMEOUT_MS);
			const done = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				socket.removeListener('error', onErr);
				socket.on('data', (d: Buffer) => {
					if (this.socket === socket) this.parser.push(d);
				});
				// Once connected, socket death just marks us dead; next execute reconnects.
				socket.on('error', () => {
					if (this.socket === socket) this.markDead();
				});
				socket.on('close', () => {
					if (this.socket === socket) this.markDead();
				});
				resolve();
			};
			if (this.cfg.useTls) {
				// RouterOS API-SSL commonly uses a self-signed cert.
				socket = tls.connect({ host: this.cfg.host, port, rejectUnauthorized: false }, done);
			} else {
				socket = net.connect({ host: this.cfg.host, port }, done);
			}
			this.socket = socket;
			socket.once('error', onErr);
		});
		try {
			await this.login();
		} catch (error) {
			const failedSocket = this.socket;
			this.markDead();
			failedSocket?.destroy();
			throw error;
		}
	}

	private send(words: string[]): void {
		if (!this.socket) throw new Error('not connected');
		this.socket.write(encodeSentence(words));
	}

	// Read sentences until a terminator (!done / !trap / !fatal). Returns all !re rows.
	private readReply(): Promise<{ rows: RouterOsRow[]; done: boolean }> {
		return new Promise((resolve, reject) => {
			const activeSocket = this.socket;
			if (!activeSocket) return reject(new Error('RouterOS API socket is not connected'));
			const rows: RouterOsRow[] = [];
			let trap: string | null = null;
			const timer = setTimeout(() => {
				cleanup();
				if (this.socket === activeSocket) this.markDead();
				activeSocket.destroy();
				reject(new Error('RouterOS API reply timeout'));
			}, REPLY_TIMEOUT_MS);

			const onData = () => {
				let s: string[] | null;
				while ((s = this.parser.next()) !== null) {
					const reply = s[0];
					const attrs = parseAttrs(s.slice(1));
					if (reply === '!re') {
						rows.push(attrs);
					} else if (reply === '!trap') {
						trap = attrs.message ?? 'RouterOS API error';
					} else if (reply === '!fatal') {
						cleanup();
						if (this.socket === activeSocket) this.markDead();
						activeSocket.destroy();
						reject(new Error(`RouterOS API fatal: ${s[1] ?? ''}`));
						return;
					} else if (reply === '!done') {
						// !done may carry attrs (e.g. login challenge)
						if (attrs.ret) rows.push(attrs);
						cleanup();
						if (trap) reject(new Error(trap));
						else resolve({ rows, done: true });
						return;
					}
				}
			};
			const cleanup = () => {
				clearTimeout(timer);
				activeSocket.removeListener('data', onData);
			};
			activeSocket.on('data', onData);
			// process anything already buffered
			onData();
		});
	}

	private async login(): Promise<void> {
		// RouterOS 6.43+ supports plain post-login (send password directly).
		this.send(['/login', `=name=${this.cfg.username}`, `=password=${this.cfg.password}`]);
		const first = await this.readReply();
		// Legacy challenge-response fallback (pre-6.43).
		const challenge = first.rows.find((r) => r.ret)?.ret;
		if (challenge) {
			const md5 = createHash('md5')
				.update(Buffer.concat([Buffer.from([0]), Buffer.from(this.cfg.password, 'utf8'), Buffer.from(challenge, 'hex')]))
				.digest('hex');
			this.send(['/login', `=name=${this.cfg.username}`, `=response=00${md5}`]);
			await this.readReply();
		}
	}

	async testConnection(): Promise<{ ok: boolean; version?: string }> {
		await this.connect();
		this.send(['/system/resource/print']);
		const { rows } = await this.readReply();
		return { ok: true, version: rows[0]?.version };
	}

	async execute(cmd: RouterOsCommand): Promise<RouterOsRow[]> {
		if (!isRouterOsPath(cmd.path)) {
			throw new Error('Invalid RouterOS path');
		}
		const words = [`${cmd.path}/${cmd.action}`];
		if (cmd.id) words.push(`=.id=${cmd.id}`);
		for (const [k, v] of Object.entries(cmd.params ?? {})) words.push(`=${k}=${v}`);
		for (const [k, v] of Object.entries(cmd.query ?? {})) words.push(`?${k}=${v}`);

		// Reuse the persistent connection; reconnect+retry once if the socket was
		// dropped (idle timeout / router restart) so we don't surface transient errors.
		try {
			await this.connect();
			this.send(words);
			return (await this.readReply()).rows;
		} catch (e) {
			if (!this.isAlive) {
				this.markDead();
				await this.connect();
				this.send(words);
				return (await this.readReply()).rows;
			}
			throw e;
		}
	}

	async close(): Promise<void> {
		this.socket?.destroy();
		this.markDead();
	}
}

export function parseAttrs(words: string[]): RouterOsRow {
	const row: RouterOsRow = {};
	for (const w of words) {
		if (w.startsWith('=')) {
			const idx = w.indexOf('=', 1);
			if (idx === -1) row[w.slice(1)] = '';
			else row[w.slice(1, idx)] = w.slice(idx + 1);
		} else if (w.startsWith('ret=')) {
			row.ret = w.slice(4);
		}
	}
	return row;
}
