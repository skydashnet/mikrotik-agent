// 9router / OpenAI-compatible client. Chat-only (no embeddings on this provider).
// Base URL + API key are per-user (configured in UI).

export interface TextContentPart {
	type: 'text';
	text: string;
}

export interface ImageContentPart {
	type: 'image_url';
	image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export type MessageContent = string | Array<TextContentPart | ImageContentPart> | null;

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: MessageContent;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

export interface ToolDef {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

// A few OpenAI-compatible gateways occasionally concatenate complete JSON
// argument objects into one tool-call delta. Split only when every segment is
// a valid object; otherwise leave the original value intact so the orchestrator
// can report a useful validation error to the model.
export function splitToolArgumentObjects(value: string): string[] {
	const input = value.trim();
	if (!input) return [input];
	try {
		JSON.parse(input);
		return [input];
	} catch {
		// Continue with the concatenated-object scanner.
	}

	const parts: string[] = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = 0; index < input.length; index++) {
		const char = input[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === '{') {
			if (depth === 0) start = index;
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth < 0) return [input];
			if (depth === 0 && start >= 0) {
				const part = input.slice(start, index + 1);
				try { JSON.parse(part); } catch { return [input]; }
				parts.push(part);
				start = -1;
			}
		} else if (depth === 0 && !/\s/.test(char)) {
			return [input];
		}
	}

	return depth === 0 && !inString && parts.length > 1 ? [...new Set(parts)] : [input];
}

export function normalizeToolCalls(calls: ToolCall[]): ToolCall[] {
	return calls.flatMap((call, callIndex) => {
		const parts = splitToolArgumentObjects(call.function.arguments);
		return parts.map((args, partIndex) => ({
			...call,
			id: parts.length === 1
				? (call.id || `tool-call-${callIndex}`)
				: `${call.id || `tool-call-${callIndex}`}-${partIndex + 1}`,
			function: { ...call.function, arguments: args }
		}));
	});
}

export interface OpenAiModel {
	id: string;
	owned_by?: string;
}

// AgentRouter's sky route currently rejects Indonesian request bodies before
// they reach the selected model. Keep Claude as the reasoning model, but use a
// route on the same 9Router gateway that accepts Indonesian to translate only
// the provider-bound copy. Original messages remain untouched for storage/UI.
export const ENGLISH_BRIDGE_MODEL = 'antigravity/gemini-pro-agent';
const TRANSLATION_BATCH_CHARS = 24_000;
const TRANSLATION_BATCH_ITEMS = 12;

export function needsEnglishBridge(model: string): boolean {
	return model.startsWith('sky/');
}

export function parseTranslationArray(value: string, expectedLength: number): string[] {
	const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	const start = trimmed.indexOf('[');
	const end = trimmed.lastIndexOf(']');
	if (start < 0 || end <= start) throw new Error('Penerjemah AI tidak mengembalikan array JSON.');
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed.slice(start, end + 1));
	} catch {
		throw new Error('Penerjemah AI mengembalikan JSON yang tidak valid.');
	}
	if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((item) => typeof item !== 'string')) {
		throw new Error('Jumlah hasil terjemahan AI tidak sesuai.');
	}
	if (parsed.some((item) => !(item as string).trim())) {
		throw new Error('Penerjemah AI mengembalikan teks kosong.');
	}
	return parsed as string[];
}

export class NineRouterClient {
	private baseUrl: string;
	private apiKey: string;
	private translationCache = new Map<string, string>();

	constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.apiKey = apiKey;
	}

	private headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json'
		};
	}

	/** Auto-detect available models via GET /models. */
	async listModels(): Promise<OpenAiModel[]> {
		const res = await fetch(`${this.baseUrl}/models`, {
			headers: this.headers(),
			signal: AbortSignal.timeout(20_000)
		});
		if (!res.ok) {
			throw new Error(`GET /models -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
		}
		const json = (await res.json()) as { data?: OpenAiModel[] };
		return json.data ?? [];
	}

	private async translateBatch(texts: string[], signal?: AbortSignal): Promise<string[]> {
		const maxTokens = Math.min(12_000, Math.max(1_024, Math.ceil(texts.join('').length / 2) + 512));
		const res = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.headers(),
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
				: AbortSignal.timeout(90_000),
			body: JSON.stringify({
				model: ENGLISH_BRIDGE_MODEL,
				messages: [
					{
						role: 'system',
						content:
							'You are a lossless translation engine. Translate every string in the input JSON array from Indonesian to natural English. Preserve MikroTik and RouterOS terms, interface names, IP addresses, URLs, file paths, menu paths, CLI commands, code, JSON keys, identifiers, numbers, and formatting exactly. If a string is already English or is machine data, return it unchanged. Return only a valid JSON array of strings in the same order and with the same length. Do not use Markdown fences or add commentary.'
					},
					{ role: 'user', content: JSON.stringify(texts) }
				],
				stream: false,
				temperature: 0,
				max_tokens: maxTokens
			})
		});
		if (!res.ok) {
			throw new Error(
				`POST /chat/completions (penerjemah) -> ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`
			);
		}
		const json = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = json.choices?.[0]?.message?.content;
		if (!content) throw new Error('Penerjemah AI tidak menghasilkan respons.');
		return parseTranslationArray(content, texts.length);
	}

	private async translateTexts(texts: string[], signal?: AbortSignal): Promise<void> {
		const missing = [...new Set(texts.filter((text) => text.trim() && !this.translationCache.has(text)))];
		for (let index = 0; index < missing.length;) {
			const batch: string[] = [];
			let chars = 0;
			while (index < missing.length && batch.length < TRANSLATION_BATCH_ITEMS) {
				const candidate = missing[index];
				if (batch.length > 0 && chars + candidate.length > TRANSLATION_BATCH_CHARS) break;
				batch.push(candidate);
				chars += candidate.length;
				index++;
			}
			const translated = await this.translateBatch(batch, signal);
			batch.forEach((source, itemIndex) => this.translationCache.set(source, translated[itemIndex]));
		}
	}

	private async messagesForProvider(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatMessage[]> {
		const texts = messages.flatMap((message) => {
			if (typeof message.content === 'string') return [message.content];
			if (Array.isArray(message.content)) {
				return message.content.flatMap((part) => part.type === 'text' ? [part.text] : []);
			}
			return [];
		});
		await this.translateTexts(texts, signal);
		return messages.map((message) => ({
			...message,
			content: typeof message.content === 'string'
				? (this.translationCache.get(message.content) ?? message.content)
				: Array.isArray(message.content)
					? message.content.map((part) => part.type === 'text'
						? { ...part, text: this.translationCache.get(part.text) ?? part.text }
						: part)
					: message.content
		}));
	}

	/**
	 * Streaming chat completion. Yields text deltas and, when the model requests
	 * tools, the assembled tool_calls (via the returned finalToolCalls).
	 * Consumers drive the tool-calling loop.
	 */
	async *streamChat(opts: {
		model: string;
		messages: ChatMessage[];
		tools?: ToolDef[];
		signal?: AbortSignal;
	}): AsyncGenerator<
		{ type: 'text'; value: string } | { type: 'tool_calls'; value: ToolCall[] },
		void,
		unknown
	> {
		const providerMessages = needsEnglishBridge(opts.model)
			? await this.messagesForProvider(opts.messages, opts.signal)
			: opts.messages;
		const res = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.headers(),
			signal: opts.signal,
			body: JSON.stringify({
				model: opts.model,
				messages: providerMessages,
				tools: opts.tools,
				stream: true
			})
		});
		if (!res.ok || !res.body) {
			throw new Error(
				`POST /chat/completions -> ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`
			);
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		// Accumulate streamed tool_calls by index.
		const toolAcc = new Map<number, ToolCall>();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('data:')) continue;
				const data = trimmed.slice(5).trim();
				if (data === '[DONE]') continue;
				let chunk: StreamChunk;
				try {
					chunk = JSON.parse(data);
				} catch {
					continue;
				}
				const delta = chunk.choices?.[0]?.delta;
				if (!delta) continue;
				if (delta.content) {
					yield { type: 'text', value: delta.content };
				}
				if (delta.tool_calls) {
					for (const tc of delta.tool_calls) {
						const idx = tc.index ?? 0;
						const existing = toolAcc.get(idx) ?? {
							id: '',
							type: 'function' as const,
							function: { name: '', arguments: '' }
						};
						if (tc.id) existing.id = tc.id;
						if (tc.function?.name) existing.function.name = tc.function.name;
						if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
						toolAcc.set(idx, existing);
					}
				}
			}
		}
		// Some compatible providers omit the final newline. Process any complete
		// trailing data frame instead of silently dropping its last delta.
		const trailing = buffer.trim();
		if (trailing.startsWith('data:')) {
			const data = trailing.slice(5).trim();
			if (data && data !== '[DONE]') {
				try {
					const chunk = JSON.parse(data) as StreamChunk;
					const content = chunk.choices?.[0]?.delta?.content;
					if (content) yield { type: 'text', value: content };
				} catch {
					// Ignore non-JSON provider terminators.
				}
			}
		}

		if (toolAcc.size > 0) {
			yield { type: 'tool_calls', value: normalizeToolCalls([...toolAcc.values()]) };
		}
	}
}

interface StreamChunk {
	choices?: Array<{
		delta?: {
			content?: string;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}>;
		};
	}>;
}
