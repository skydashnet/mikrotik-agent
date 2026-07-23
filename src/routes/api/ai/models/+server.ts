import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAiSettings } from '$lib/server/ai-settings';
import { NineRouterClient } from '$lib/server/ai/client';

// Auto-detect available models from the configured 9router endpoint.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const s = await getAiSettings(locals.user.id);
	if (!s?.apiKey || !s.baseUrl) throw error(400, 'AI belum dikonfigurasi.');
	const client = new NineRouterClient(s.baseUrl, s.apiKey);
	try {
		const models = await client.listModels();
		return json({ models: models.map((m) => m.id) });
	} catch (e) {
		throw error(502, (e as Error).message);
	}
};
