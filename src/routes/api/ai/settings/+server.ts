import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getAiSettings, saveAiSettings, setActiveModel } from '$lib/server/ai-settings';

// Never return the API key to the client; only whether one is set.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const s = await getAiSettings(locals.user.id);
	return json({
		baseUrl: s?.baseUrl ?? '',
		activeModel: s?.activeModel ?? null,
		hasApiKey: !!s?.apiKey
	});
};

const saveSchema = z.object({
	baseUrl: z.string().trim().url().max(500).refine((value) => {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
	}, 'Base URL harus HTTP/HTTPS tanpa kredensial di URL.'),
	apiKey: z.string().min(1).max(4_096).optional(),
	activeModel: z.string().trim().min(1).max(200).nullable().optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const parsed = saveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);

	const existing = await getAiSettings(locals.user.id);
	// Keep existing key if none provided (so the UI never needs to re-send it).
	const apiKey = parsed.data.apiKey ?? existing?.apiKey;
	if (!apiKey) throw error(400, 'API key belum diatur.');

	await saveAiSettings(
		locals.user.id,
		parsed.data.baseUrl,
		apiKey,
		parsed.data.activeModel ?? existing?.activeModel ?? null
	);
	return json({ ok: true });
};

// Lightweight: set active model only.
const modelSchema = z.object({ model: z.string().trim().min(1).max(200) });
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const parsed = modelSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'model wajib diisi');
	await setActiveModel(locals.user.id, parsed.data.model);
	return json({ ok: true });
};
