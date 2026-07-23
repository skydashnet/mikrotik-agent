import { describe, expect, it } from 'vitest';
import { compactHistory, memorySystemMessage, RECENT_MESSAGE_LIMIT } from './memory.js';
import type { StoredChatMessage } from '../chat.js';

function message(id: number): StoredChatMessage {
	return { id, role: id % 2 ? 'user' : 'assistant', content: `pesan-${id}` };
}

describe('memori percakapan', () => {
	it('hanya memutar ulang pesan terbaru setelah cursor memori', () => {
		const messages = Array.from({ length: 30 }, (_, index) => message(index + 1));
		const compacted = compactHistory(messages, 8);
		expect(compacted).toHaveLength(RECENT_MESSAGE_LIMIT);
		expect(compacted[0].content).toBe('pesan-15');
		expect(compacted.at(-1)?.content).toBe('pesan-30');
	});

	it('menyuntikkan ringkasan sebagai instruksi konteks', () => {
		const memory = memorySystemMessage('- Router utama bernama Core-01.');
		expect(memory.role).toBe('system');
		expect(memory.content).toContain('Core-01');
		expect(memory.content).toContain('data live');
	});
});
