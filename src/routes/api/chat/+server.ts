import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getAiSettings } from '$lib/server/ai-settings';
import { NineRouterClient, type ChatMessage } from '$lib/server/ai/client';
import { runChat, SYSTEM_PROMPT } from '$lib/server/ai/orchestrator';
import {
	getSession,
	createSession,
	getStoredMessages,
	addMessage,
	undoChatTurn
} from '$lib/server/chat';
import { getRouter } from '$lib/server/routers';
import { memorySystemMessage, prepareConversationMemory } from '$lib/server/ai/memory';
import {
	ALLOWED_IMAGE_TYPES,
	MAX_IMAGES,
	decodeAndValidateImages,
	saveChatImages,
	removeChatImageFiles
} from '$lib/server/chat-images';
import { friendlyAiError } from '$lib/server/ai/errors';

const bodySchema = z.object({
	sessionId: z.number().int().nullable().optional(),
	routerId: z.number().int().nullable().optional(),
	message: z.string().trim().max(12_000).default(''),
	images: z.array(z.object({
		name: z.string().trim().min(1).max(200),
		type: z.enum(ALLOWED_IMAGE_TYPES),
		data: z.string().min(1).max(7_100_000)
	})).max(MAX_IMAGES).default([])
}).refine((body) => body.message.length > 0 || body.images.length > 0, {
	message: 'Pesan atau gambar wajib diisi.'
});

const undoSchema = z.object({ sessionId: z.number().int().positive() });

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const parsed = undoSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Sesi chat tidak valid.');
	const undone = await undoChatTurn(locals.user.id, parsed.data.sessionId);
	if (!undone) throw error(404, 'Pesan terakhir tidak ditemukan.');
	await removeChatImageFiles(undone.storagePaths);
	return Response.json({ message: undone.message, sessionDeleted: undone.sessionDeleted });
};

// Streams the assistant reply as SSE. Persists user + assistant/tool turns.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const userId = locals.user.id;

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);
	const message = parsed.data.message || 'Analisis gambar ini dan jelaskan temuan pentingnya.';
	let decodedImages: ReturnType<typeof decodeAndValidateImages>;
	try {
		decodedImages = decodeAndValidateImages(parsed.data.images);
	} catch (validationError) {
		throw error(400, (validationError as Error).message);
	}

	const settings = await getAiSettings(userId);
	if (!settings?.apiKey || !settings.baseUrl || !settings.activeModel) {
		throw error(400, 'AI belum dikonfigurasi (base URL, API key, model).');
	}

	// Resolve or create the chat session (ownership enforced).
	let sessionId = parsed.data.sessionId;
	let routerId = parsed.data.routerId ?? null;
	let chatSession;
	if (sessionId) {
		chatSession = await getSession(userId, sessionId);
		if (!chatSession) throw error(404, 'Sesi chat tidak ditemukan.');
		routerId = chatSession.router_id;
	} else {
		if (routerId !== null && !(await getRouter(userId, routerId))) {
			throw error(404, 'Router tidak ditemukan.');
		}
		sessionId = await createSession(userId, routerId, message.slice(0, 80));
		chatSession = await getSession(userId, sessionId);
	}
	if (!chatSession) throw error(500, 'Sesi chat gagal dibuat.');

	// Summarize old turns into persistent memory, then keep recent turns verbatim.
	const history = await getStoredMessages(sessionId);
	const client = new NineRouterClient(settings.baseUrl, settings.apiKey);
	const prepared = await prepareConversationMemory({
		client,
		model: settings.activeModel,
		session: chatSession,
		history
	});

	const persistedUserMsg: ChatMessage = { role: 'user', content: message };
	const userMessageId = await addMessage(sessionId, persistedUserMsg);
	if (decodedImages.length) await saveChatImages(userId, userMessageId, decodedImages);

	const userMsg: ChatMessage = decodedImages.length
		? {
			role: 'user',
			content: [
				{ type: 'text', text: message },
				...decodedImages.map((image) => ({
					type: 'image_url' as const,
					image_url: { url: `data:${image.type};base64,${image.data}`, detail: 'high' as const }
				}))
			]
		}
		: persistedUserMsg;

	const messages: ChatMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		...(prepared.memory ? [memorySystemMessage(prepared.memory)] : []),
		...prepared.recent,
		userMsg
	];

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const send = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					closed = true;
				}
			};
			send('session', { sessionId });

			try {
				const gen = runChat({
					client,
					model: settings.activeModel!,
					messages,
					toolContext: { userId, routerId },
					signal: request.signal
				});

				let result = await gen.next();
				while (!result.done) {
					const ev = result.value;
					if (ev.type === 'text') send('token', { value: ev.value });
					else send('tool', { phase: ev.type, name: ev.value });
					result = await gen.next();
				}

				// Persist everything the orchestrator appended after the user turn.
				const finalConversation = result.value;
				const startIdx = messages.length; // system+history+user already stored (except system)
				for (let i = startIdx; i < finalConversation.length; i++) {
					await addMessage(sessionId, finalConversation[i]);
				}
				send('done', { sessionId });
			} catch (e) {
				if (request.signal.aborted) {
					send('error', { message: 'Respons dihentikan.' });
				} else {
					const undone = await undoChatTurn(userId, sessionId, userMessageId).catch(() => null);
					if (undone) await removeChatImageFiles(undone.storagePaths);
					send('error', {
						message: friendlyAiError(e),
						rollback: !!undone,
						sessionDeleted: undone?.sessionDeleted ?? false
					});
				}
			} finally {
				if (!closed) {
					try { controller.close(); } catch { /* client disconnected */ }
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
