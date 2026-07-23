import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listRouters } from '$lib/server/routers';
import { getRouterStatus } from '$lib/server/routeros/connection-manager';

// One bulk request keeps dashboard polling cheap. Connection tests themselves
// are pooled and cached server-side, so multiple tabs do not spam RouterOS.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401);
	const routers = await listRouters(locals.user.id);
	const statuses = await Promise.all(
		routers.map(async (router) => ({
			id: Number(router.id),
			...(await getRouterStatus(locals.user!.id, Number(router.id)))
		}))
	);
	return json(
		{ statuses },
		{ headers: { 'Cache-Control': 'private, no-store' } }
	);
};
