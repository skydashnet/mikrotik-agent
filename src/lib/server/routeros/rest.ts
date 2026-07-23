import http from 'node:http';
import https from 'node:https';
import { isRouterOsPath } from './types.js';
import type {
	RouterOsClient,
	RouterOsCommand,
	RouterOsRow,
	RouterConnectionConfig
} from './types.js';

// RouterOS v7 REST API.
// Menu path '/ip/address' + action maps to:
//   print  -> GET  /rest/ip/address        (or POST /rest/ip/address/print with .query)
//   add    -> PUT  /rest/ip/address
//   set    -> PATCH /rest/ip/address/<id>
//   remove -> DELETE /rest/ip/address/<id>
export class RestClient implements RouterOsClient {
	private base: string;
	private auth: string;

	constructor(cfg: RouterConnectionConfig) {
		const scheme = cfg.useTls ? 'https' : 'http';
		const port = cfg.port ?? (cfg.useTls ? 443 : 80);
		const host = cfg.host.includes(':') && !cfg.host.startsWith('[') ? `[${cfg.host}]` : cfg.host;
		this.base = `${scheme}://${host}:${port}/rest`;
		this.auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
	}

	private async req(method: string, path: string, body?: unknown): Promise<unknown> {
		const target = new URL(this.base + path);
		const payload = body === undefined ? undefined : JSON.stringify(body);
		return new Promise((resolve, reject) => {
			const request = (target.protocol === 'https:' ? https : http).request(target, {
				method,
				headers: {
					Authorization: this.auth,
					Accept: 'application/json',
					...(payload === undefined ? {} : {
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(payload)
					})
				},
				// RouterOS www-ssl commonly uses a self-signed certificate, just like api-ssl.
				...(target.protocol === 'https:' ? { rejectUnauthorized: false } : {})
			}, (response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on('data', (chunk: Buffer) => {
					size += chunk.length;
					if (size > 32 * 1024 * 1024) {
						request.destroy(new Error('Respons RouterOS REST melebihi batas 32 MB.'));
						return;
					}
					chunks.push(chunk);
				});
				response.on('end', () => {
					const status = response.statusCode ?? 0;
					const text = Buffer.concat(chunks).toString('utf8');
					if (status < 200 || status >= 300) {
						const authHint = status === 401 || status === 403
							? ' Periksa username, password, dan policy rest-api pada grup user.'
							: '';
						reject(new Error(`RouterOS REST ${method} ${path} -> ${status}: ${text.slice(0, 300)}${authHint}`));
						return;
					}
					if (status === 204 || !text) {
						resolve([]);
						return;
					}
					const contentType = String(response.headers['content-type'] ?? '');
					if (!contentType.includes('application/json')) {
						resolve([]);
						return;
					}
					try {
						resolve(JSON.parse(text));
					} catch {
						reject(new Error('RouterOS REST mengirim JSON yang tidak valid.'));
					}
				});
			});
			request.setTimeout(15_000, () => {
				request.destroy(new Error(`RouterOS REST ${target.host} tidak merespons dalam 15 detik. Periksa layanan ${target.protocol === 'https:' ? 'www-ssl' : 'www'} dan portnya.`));
			});
			request.on('error', (error: NodeJS.ErrnoException) => {
				if (error.code === 'ECONNREFUSED') {
					reject(new Error(`Koneksi REST ke ${target.host} ditolak. Aktifkan layanan ${target.protocol === 'https:' ? 'www-ssl' : 'www'} atau periksa portnya.`));
					return;
				}
				reject(error);
			});
			if (payload !== undefined) request.write(payload);
			request.end();
		});
	}

	private rows(payload: unknown): RouterOsRow[] {
		if (Array.isArray(payload)) return payload as RouterOsRow[];
		if (payload && typeof payload === 'object') return [payload as RouterOsRow];
		return [];
	}

	async testConnection(): Promise<{ ok: boolean; version?: string }> {
		// /system/resource exposes `version`
		const rows = this.rows(await this.req('GET', '/system/resource'));
		const version = rows[0]?.version;
		return { ok: true, version };
	}

	async execute(cmd: RouterOsCommand): Promise<RouterOsRow[]> {
		const p = cmd.path.startsWith('/') ? cmd.path : `/${cmd.path}`;
		if (!isRouterOsPath(p)) {
			throw new Error('Invalid RouterOS path');
		}
		switch (cmd.action) {
			case 'print': {
				const qs = cmd.query
					? '?' +
						new URLSearchParams(
							Object.fromEntries(Object.entries(cmd.query).map(([k, v]) => [k, String(v)]))
						).toString()
					: '';
				return this.rows(await this.req('GET', p + qs));
			}
			case 'add': {
				const row = (await this.req('PUT', p, cmd.params ?? {})) as RouterOsRow;
				return row ? [row] : [];
			}
			case 'set': {
				if (!cmd.id) throw new Error("REST 'set' requires an id");
				const row = (await this.req('PATCH', `${p}/${cmd.id}`, cmd.params ?? {})) as RouterOsRow;
				return row ? [row] : [];
			}
			case 'remove': {
				if (!cmd.id) throw new Error("REST 'remove' requires an id");
				await this.req('DELETE', `${p}/${cmd.id}`);
				return [];
			}
			case 'monitor': {
				// One-shot monitor via print-once endpoint when available.
				return this.rows(await this.req('POST', `${p}/print`, { once: '' }));
			}
			default:
				throw new Error(`Unsupported action: ${cmd.action}`);
		}
	}

	// Stateless HTTP; always "alive". (RouterOS still logs each Basic-auth request.)
	get isAlive(): boolean {
		return true;
	}

	async close(): Promise<void> {
		// stateless (fetch); nothing to release
	}
}
