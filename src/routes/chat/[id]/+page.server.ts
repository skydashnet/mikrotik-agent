import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRouter } from '$lib/server/routers';
import { getAiSettings } from '$lib/server/ai-settings';
import { listSessions, getSession, getDisplayMessages } from '$lib/server/chat';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const router = await getRouter(locals.user.id, Number(params.id));
	if (!router) throw error(404, 'Router tidak ditemukan');
	const ai = await getAiSettings(locals.user.id);
	const sessions = (await listSessions(locals.user.id)).filter((session) => session.router_id === router.id);
	const requestedId = Number(url.searchParams.get('session'));
	let selected = Number.isSafeInteger(requestedId) && requestedId > 0
		? await getSession(locals.user.id, requestedId)
		: null;
	if (selected?.router_id !== router.id) selected = null;
	const history = selected ? await getDisplayMessages(selected.id) : [];
	return {
		router: { id: router.id, name: router.name, host: router.host },
		aiReady: !!(ai?.apiKey && ai.baseUrl && ai.activeModel),
		model: ai?.activeModel ?? null,
		sessions: sessions.map(({ id, title, created_at }) => ({ id, title, created_at })),
		selectedSessionId: selected?.id ?? null,
		messages: history
			.filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content)
			.map((message) => ({
				role: message.role as 'user' | 'assistant',
				content: message.content,
				attachments: (message.attachments ?? []).map((attachment) => ({
					name: attachment.filename,
					url: `/api/chat/images/${attachment.id}`
				}))
			}))
	};
};
