import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAiSettings } from '$lib/server/ai-settings';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const s = await getAiSettings(locals.user.id);
	return {
		baseUrl: s?.baseUrl ?? '',
		activeModel: s?.activeModel ?? null,
		hasApiKey: !!s?.apiKey
	};
};
