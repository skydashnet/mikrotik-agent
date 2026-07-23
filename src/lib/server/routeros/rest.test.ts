import { afterEach, describe, expect, it } from 'vitest';
import http, { type Server } from 'node:http';
import { RestClient } from './rest.js';

let server: Server | undefined;

afterEach(async () => {
	if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
	server = undefined;
});

async function startRouterServer(): Promise<number> {
	server = http.createServer((request, response) => {
		if (request.headers.authorization !== `Basic ${Buffer.from('aiagent:rahasia').toString('base64')}`) {
			response.writeHead(401, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ error: 401, message: 'Unauthorized' }));
			return;
		}
		response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		if (request.url === '/rest/system/resource') {
			// Current RouterOS releases can return a singleton resource as an object.
			response.end(JSON.stringify({ version: '7.17 (stable)', uptime: '1d2h' }));
			return;
		}
		response.end(JSON.stringify([{ name: 'ether1', running: 'true' }]));
	});
	await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Server test gagal dimulai');
	return address.port;
}

describe('RestClient', () => {
	it('menormalisasi respons objek dan array dari RouterOS', async () => {
		const port = await startRouterServer();
		const client = new RestClient({ host: '127.0.0.1', port, useTls: false, username: 'aiagent', password: 'rahasia' });

		await expect(client.testConnection()).resolves.toEqual({ ok: true, version: '7.17 (stable)' });
		await expect(client.execute({ path: '/interface', action: 'print' })).resolves.toEqual([
			{ name: 'ether1', running: 'true' }
		]);
	});

	it('memberi petunjuk policy saat autentikasi REST ditolak', async () => {
		const port = await startRouterServer();
		const client = new RestClient({ host: '127.0.0.1', port, useTls: false, username: 'aiagent', password: 'salah' });

		await expect(client.testConnection()).rejects.toThrow('policy rest-api');
	});
});
