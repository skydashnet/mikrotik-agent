import { describe, expect, it } from 'vitest';
import { decodeAndValidateImages } from './chat-images.js';

describe('validasi gambar chat', () => {
	it('menerima PNG berdasarkan signature file', () => {
		const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
		const result = decodeAndValidateImages([{ name: 'router.png', type: 'image/png', data: png.toString('base64') }]);
		expect(result[0].bytes.equals(png)).toBe(true);
	});

	it('menolak file palsu meskipun MIME mengaku gambar', () => {
		expect(() => decodeAndValidateImages([{
			name: 'palsu.png', type: 'image/png', data: Buffer.from('bukan gambar').toString('base64')
		}])).toThrow(/tidak cocok/);
	});
});
