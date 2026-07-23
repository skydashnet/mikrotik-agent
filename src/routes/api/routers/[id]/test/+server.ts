import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testRouter } from '$lib/server/routeros/connection-manager';
import { getRouter } from '$lib/server/routers';

// Test connectivity through the connection manager (reuses/pools the connection).
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) throw error(400, 'ID router tidak valid.');
	if (!(await getRouter(locals.user.id, id))) throw error(404, 'Router tidak ditemukan.');
	try {
		const result = await testRouter(locals.user.id, id);
		return json(result);
	} catch (e) {
		return json({ ok: false, error: (e as Error).message }, { status: 200 });
	}
};
