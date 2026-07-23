import { describe, expect, it } from 'vitest';
import { friendlyAiError } from './errors.js';

describe('pesan error AI aman untuk pengguna', () => {
	it('menyederhanakan content-blocked tanpa membocorkan request id provider', () => {
		const result = friendlyAiError(new Error('POST /chat/completions -> 400: {"code":"content-blocked","request":"rahasia"} (reset after 30s)'));
		expect(result).toContain('filter konten');
		expect(result).toContain('30 detik');
		expect(result).not.toContain('request');
		expect(result).not.toContain('POST /chat/completions');
	});

	it('tidak meneruskan detail error provider yang tidak dikenal', () => {
		const result = friendlyAiError(new Error('socket secret internal detail'));
		expect(result).toBe('Respons AI gagal diproses. Pesan dibatalkan dan tidak disimpan. Silakan coba lagi.');
	});
});
