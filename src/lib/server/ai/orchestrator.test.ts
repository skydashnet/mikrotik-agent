import { describe, expect, it } from 'vitest';
import type { NineRouterClient } from './client.js';
import { cleanAssistantTypography, runChat, SYSTEM_PROMPT } from './orchestrator.js';

describe('system prompt AI', () => {
	it('mewajibkan jawaban dalam Bahasa Indonesia', () => {
		expect(SYSTEM_PROMPT).toContain('MUST answer');
		expect(SYSTEM_PROMPT).toContain('in Indonesian');
		expect(SYSTEM_PROMPT).toContain('Never switch');
	});

	it('menghapus em dash dari keluaran yang terlihat pengguna', () => {
		expect(SYSTEM_PROMPT).toContain('Do not use em dashes');
		expect(cleanAssistantTypography('Antrian penuh \u2014 paket dibuang.')).toBe('Antrian penuh, paket dibuang.');
	});

	it('menghentikan loop tool berulang dan meminta jawaban akhir tanpa tool', async () => {
		let requestCount = 0;
		const client = {
			async *streamChat(options: { tools?: unknown[] }) {
				requestCount++;
				if (options.tools) {
					yield {
						type: 'tool_calls' as const,
						value: [{
							id: `call-${requestCount}`,
							type: 'function' as const,
							function: { name: 'ros_print', arguments: '{"path":"/queue/simple"}' }
						}]
					};
				} else {
					yield { type: 'text' as const, value: 'Berikut ringkasan queue berdasarkan data yang tersedia.' };
				}
			}
		} as unknown as NineRouterClient;

		const generator = runChat({
			client,
			model: 'test-model',
			messages: [{ role: 'user', content: 'Periksa queue' }],
			toolContext: { userId: 1, routerId: null }
		});
		const text: string[] = [];
		let result = await generator.next();
		while (!result.done) {
			if (result.value.type === 'text') text.push(result.value.value);
			result = await generator.next();
		}

		expect(requestCount).toBe(3);
		expect(text.join('')).toContain('Berikut ringkasan queue');
		expect(text.join('')).not.toContain('Batas pemanggilan tool');
		expect(result.value.at(-1)).toEqual({
			role: 'assistant',
			content: 'Berikut ringkasan queue berdasarkan data yang tersedia.'
		});
	});
});
