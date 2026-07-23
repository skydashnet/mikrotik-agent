import { describe, expect, it } from 'vitest';
import { parseDbBigInt } from './db.js';

describe('parseDbBigInt', () => {
	it('normalizes PostgreSQL BIGINT IDs to numbers', () => {
		expect(parseDbBigInt('42')).toBe(42);
	});

	it('rejects unsafe IDs instead of silently losing precision', () => {
		expect(() => parseDbBigInt('9007199254740992')).toThrow(/safe range/);
	});
});
