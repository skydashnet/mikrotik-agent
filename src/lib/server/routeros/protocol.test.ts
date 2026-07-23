import { describe, expect, it } from 'vitest';
import { encodeLength, parseAttrs, SentenceParser } from './api.js';
import { isRouterOsPath } from './types.js';

describe('RouterOS binary protocol', () => {
	it('encodes all length prefix boundaries', () => {
		expect([...encodeLength(0x7f)]).toEqual([0x7f]);
		expect(encodeLength(0x80)).toHaveLength(2);
		expect(encodeLength(0x4000)).toHaveLength(3);
		expect(encodeLength(0x200000)).toHaveLength(4);
		expect(encodeLength(0x10000000)).toHaveLength(5);
		expect(() => encodeLength(-1)).toThrow(/unsigned 32-bit/);
	});

	it('retains partial sentences until all bytes arrive', () => {
		const parser = new SentenceParser();
		parser.push(Buffer.from([3, 0x21]));
		expect(parser.next()).toBeNull();
		parser.push(Buffer.from([0x72, 0x65, 0]));
		expect(parser.next()).toEqual(['!re']);
	});

	it('parses attributes without truncating embedded equals signs', () => {
		expect(parseAttrs(['=name=ether1', '=comment=a=b', 'ret=abc'])).toEqual({
			name: 'ether1', comment: 'a=b', ret: 'abc'
		});
	});
});

describe('RouterOS path guard', () => {
	it('allows menu paths and rejects traversal or URL fragments', () => {
		expect(isRouterOsPath('/ip/firewall/filter')).toBe(true);
		expect(isRouterOsPath('/system/../user')).toBe(false);
		expect(isRouterOsPath('/ip/address?x=1')).toBe(false);
	});
});
