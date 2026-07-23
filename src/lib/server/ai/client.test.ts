import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ENGLISH_BRIDGE_MODEL,
	NineRouterClient,
	needsEnglishBridge,
	normalizeToolCalls,
	parseTranslationArray,
	splitToolArgumentObjects,
	type ToolCall
} from './client.js';

afterEach(() => vi.restoreAllMocks());

describe('normalisasi tool call provider', () => {
	it('memisahkan objek argumen JSON yang tergabung', () => {
		expect(splitToolArgumentObjects('{"path":"/queue/simple"}{"path":"/queue/tree"}')).toEqual([
			'{"path":"/queue/simple"}',
			'{"path":"/queue/tree"}'
		]);
	});

	it('tidak memecah JSON valid yang memiliki objek bersarang', () => {
		const args = '{"path":"/ip/route","query":{"active":"true"}}';
		expect(splitToolArgumentObjects(args)).toEqual([args]);
	});

	it('mengembangkan satu call provider menjadi call terpisah dengan id unik', () => {
		const calls: ToolCall[] = [{
			id: 'call-1',
			type: 'function',
			function: { name: 'ros_print', arguments: '{"path":"/queue/simple"}{"path":"/queue/tree"}' }
		}];
		const normalized = normalizeToolCalls(calls);
		expect(normalized.map((call) => call.id)).toEqual(['call-1-1', 'call-1-2']);
		expect(normalized.map((call) => JSON.parse(call.function.arguments).path)).toEqual(['/queue/simple', '/queue/tree']);
	});
});

describe('bridge Bahasa Indonesia untuk AgentRouter', () => {
	it('hanya aktif untuk model sky', () => {
		expect(needsEnglishBridge('sky/claude-opus-4-8')).toBe(true);
		expect(needsEnglishBridge('antigravity/gemini-pro-agent')).toBe(false);
	});

	it('membaca array JSON meskipun provider membungkusnya dengan fence', () => {
		expect(parseTranslationArray('```json\n["Hello", "World"]\n```', 2)).toEqual(['Hello', 'World']);
		expect(() => parseTranslationArray('["Only one"]', 2)).toThrow('Jumlah hasil');
	});

	it('menerjemahkan salinan payload sky tanpa mengubah pesan asli atau gambar', async () => {
		const requests: Array<Record<string, unknown>> = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requests.push(body);
			if (body.model === ENGLISH_BRIDGE_MODEL) {
				return Response.json({
					choices: [{ message: { content: '["Always answer in Indonesian.","Check this interface"]' } }]
				});
			}
			return new Response('data: {"choices":[{"delta":{"content":"Siap."}}]}\n\ndata: [DONE]\n\n', {
				headers: { 'Content-Type': 'text/event-stream' }
			});
		});

		const original = [
			{ role: 'system' as const, content: 'Selalu jawab dalam Bahasa Indonesia.' },
			{
				role: 'user' as const,
				content: [
					{ type: 'text' as const, text: 'Periksa interface ini' },
					{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' as const } }
				]
			}
		];
		const client = new NineRouterClient('http://gateway.test/v1', 'secret');
		const output: string[] = [];
		for await (const event of client.streamChat({ model: 'sky/claude-opus-4-8', messages: original })) {
			if (event.type === 'text') output.push(event.value);
		}

		expect(output.join('')).toBe('Siap.');
		expect(requests).toHaveLength(2);
		expect(requests[0].model).toBe(ENGLISH_BRIDGE_MODEL);
		expect(requests[1].messages).toEqual([
			{ role: 'system', content: 'Always answer in Indonesian.' },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'Check this interface' },
					{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' } }
				]
			}
		]);
		expect(original[0].content).toBe('Selalu jawab dalam Bahasa Indonesia.');
	});
});
