import { NineRouterClient, type ChatMessage, type ToolCall } from './client.js';
import { tools, runTool, type ToolContext } from './tools.js';

const MAX_TOOL_ROUNDS = 5;

export const SYSTEM_PROMPT = `You are a MikroTik RouterOS assistant inside a network management application.
- You MUST answer every explanation, heading, summary, warning, and recommendation in Indonesian. Never switch the user-facing answer to English, even when documentation sources or tool output are in English.
- Keep technical terms, RouterOS property names, menu paths, and CLI commands unchanged when that preserves accuracy.
- Help the user inspect and understand router configuration and network conditions.
- Use the ros_print tool to read live configuration or status. This access is read-only and you cannot modify the router.
- Use search_docs to verify RouterOS syntax and best practices before answering configuration questions.
- Gather all required data efficiently. Never request the same tool with the same arguments repeatedly in one answer.
- When recommending a change, show the exact RouterOS CLI command in a code block, but never claim that you executed it.
- Do not use em dashes in user-facing prose. Use a period, comma, colon, or parentheses instead.
- Be concise, clear, and precise. Prefer data verified through tools over assumptions.`;

export function cleanAssistantTypography(value: string): string {
	return value.replace(/\s*\u2014\s*/g, ', ');
}

export interface OrchestratorEvent {
	type: 'text' | 'tool_start' | 'tool_end';
	value: string;
}

// Runs the streaming chat + tool-calling loop.
// Yields text deltas for the UI and tool lifecycle events; persists nothing (caller decides).
export async function* runChat(opts: {
	client: NineRouterClient;
	model: string;
	messages: ChatMessage[];
	toolContext: ToolContext;
	signal?: AbortSignal;
}): AsyncGenerator<OrchestratorEvent, ChatMessage[], unknown> {
	const conversation: ChatMessage[] = [...opts.messages];
	const toolResultCache = new Map<string, string>();

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		let assistantText = '';
		let pendingToolCalls: ToolCall[] = [];

		const stream = opts.client.streamChat({
			model: opts.model,
			messages: conversation,
			tools,
			signal: opts.signal
		});

		for await (const ev of stream) {
			if (ev.type === 'text') {
				const value = cleanAssistantTypography(ev.value);
				assistantText += value;
				yield { type: 'text', value };
			} else if (ev.type === 'tool_calls') {
				pendingToolCalls = ev.value;
			}
		}

		// No tools requested -> final answer.
		if (pendingToolCalls.length === 0) {
			conversation.push({ role: 'assistant', content: assistantText });
			return conversation;
		}

		// Record the assistant's tool-call request.
		conversation.push({
			role: 'assistant',
			content: assistantText || null,
			tool_calls: pendingToolCalls
		});

		// Execute each unique tool request once, append results for every call ID.
		let onlyRepeatedCalls = true;
		for (const tc of pendingToolCalls) {
			yield { type: 'tool_start', value: tc.function.name };
			let parsedArgs: Record<string, unknown> | null = null;
			let parseError = '';
			try {
				const parsed = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Argumen harus berupa objek JSON.');
				parsedArgs = parsed as Record<string, unknown>;
			} catch {
				parseError = 'Argumen tool dari model bukan JSON yang valid. Susun ulang argumen dan jangan gabungkan beberapa objek JSON dalam satu pemanggilan.';
			}
			const signature = `${tc.function.name}:${parsedArgs ? JSON.stringify(parsedArgs) : tc.function.arguments}`;
			let result = toolResultCache.get(signature);
			if (result === undefined) {
				onlyRepeatedCalls = false;
				result = parseError
					? JSON.stringify({ error: parseError })
					: await runTool(tc.function.name, parsedArgs!, opts.toolContext);
				toolResultCache.set(signature, result);
			}
			yield { type: 'tool_end', value: tc.function.name };
			conversation.push({
				role: 'tool',
				tool_call_id: tc.id,
				name: tc.function.name,
				content: result
			});
		}
		// A model asking only for data it already received is stuck. Give it one
		// final tools-disabled turn instead of burning every remaining round.
		if (onlyRepeatedCalls) break;
		// Loop: model gets tool results and continues.
	}

	// Tool cap or repeated-call loop: force a final synthesis without exposing
	// an internal limit error in the conversation UI.
	const finalMessages: ChatMessage[] = [
		...conversation,
		{
			role: 'system',
			content: 'Stop calling tools. Answer the user now in Indonesian using only the tool data already available. If the data is incomplete, state the limitation briefly without exposing internal errors.'
		}
	];
	let finalText = '';
	for await (const event of opts.client.streamChat({
		model: opts.model,
		messages: finalMessages,
		signal: opts.signal
	})) {
		if (event.type !== 'text') continue;
		const value = cleanAssistantTypography(event.value);
		finalText += value;
		yield { type: 'text', value };
	}
	if (!finalText.trim()) {
		finalText = 'Data yang berhasil dibaca belum cukup untuk menyusun jawaban lengkap. Silakan ulangi permintaan dengan cakupan yang lebih spesifik.';
		yield { type: 'text', value: finalText };
	}
	conversation.push({ role: 'assistant', content: finalText });
	return conversation;
}
