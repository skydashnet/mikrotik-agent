import { describe, expect, it } from 'vitest';
import { parseSseFrame } from './sse.js';

describe('parseSseFrame', () => {
	it('parses CRLF frames and event names', () => {
		expect(parseSseFrame('event: token\r\ndata: {"value":"ok"}\r\n')).toEqual({
			event: 'token', data: { value: 'ok' }
		});
	});

	it('ignores comments and rejects incomplete JSON', () => {
		expect(parseSseFrame(': keepalive\nevent: token\ndata: {bad')).toBeNull();
		expect(parseSseFrame('event: done')).toBeNull();
	});
});
