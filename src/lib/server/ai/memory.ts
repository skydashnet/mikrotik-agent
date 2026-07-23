import type { ChatMessage } from './client.js';
import { NineRouterClient } from './client.js';
import type { ChatSession, StoredChatMessage } from '../chat.js';
import { updateChatMemory } from '../chat.js';

export const RECENT_MESSAGE_LIMIT = 16;
const KEEP_AFTER_SUMMARY = 10;

function replayable(messages: StoredChatMessage[]): StoredChatMessage[] {
	return messages.filter(
		(message) =>
			(message.role === 'user' || message.role === 'assistant') &&
			typeof message.content === 'string' &&
			message.content.trim().length > 0
	);
}

export function compactHistory(messages: StoredChatMessage[], afterId: number | null): ChatMessage[] {
	return replayable(messages)
		.filter((message) => afterId === null || message.id > afterId)
		.slice(-RECENT_MESSAGE_LIMIT)
		.map(({ role, content }) => ({ role, content }));
}

async function createSummary(
	client: NineRouterClient,
	model: string,
	previousSummary: string | null,
	messages: StoredChatMessage[]
): Promise<string> {
	const transcript = messages
		.map((message) => `${message.role === 'user' ? 'Pengguna' : 'Asisten'}: ${String(message.content)}`)
		.join('\n\n');
	const prompt = `Perbarui memori percakapan berikut dalam Bahasa Indonesia.
Pertahankan hanya fakta yang berguna untuk percakapan selanjutnya: tujuan pengguna, topologi dan identitas router, konfigurasi yang ditemukan, preferensi, keputusan, masalah yang belum selesai, serta larangan atau batasan penting.
Jangan mengarang. Jangan menulis percakapan kata demi kata. Gunakan butir ringkas dan maksimal 1.800 karakter.

Memori sebelumnya:
${previousSummary || '(belum ada)'}

Percakapan baru yang perlu diserap:
${transcript}`;

	let summary = '';
	for await (const event of client.streamChat({
		model,
		messages: [
			{ role: 'system', content: 'Anda adalah mesin peringkas memori yang akurat dan tidak menambahkan fakta baru.' },
			{ role: 'user', content: prompt }
		]
	})) {
		if (event.type === 'text') summary += event.value;
	}
	if (!summary.trim()) throw new Error('Model tidak menghasilkan ringkasan memori.');
	return summary.trim().slice(0, 2_500);
}

export async function prepareConversationMemory(options: {
	client: NineRouterClient;
	model: string;
	session: ChatSession;
	history: StoredChatMessage[];
}): Promise<{ memory: string | null; recent: ChatMessage[] }> {
	const relevant = replayable(options.history);
	let memory = options.session.memory_summary;
	let cursor = options.session.memory_through_message_id;
	const unsummarized = relevant.filter((message) => cursor === null || message.id > cursor);

	if (unsummarized.length > RECENT_MESSAGE_LIMIT) {
		const toSummarize = unsummarized.slice(0, -KEEP_AFTER_SUMMARY);
		try {
			memory = await createSummary(options.client, options.model, memory, toSummarize);
			cursor = toSummarize.at(-1)?.id ?? cursor;
			if (cursor !== null) await updateChatMemory(options.session.id, memory, cursor);
		} catch {
			// Chat must remain available even if the provider cannot create a summary.
			// The recent-history cap still prevents an unbounded request payload.
		}
	}

	return { memory, recent: compactHistory(options.history, cursor) };
}

export function memorySystemMessage(summary: string): ChatMessage {
	return {
		role: 'system',
		content: `MEMORI PERCAKAPAN PERSISTEN
Gunakan memori ini sebagai konteks, tetapi koreksi bila data live dari tool menunjukkan kondisi yang lebih baru. Jangan menyebut keberadaan mekanisme memori kecuali ditanya.

${summary}`
	};
}
