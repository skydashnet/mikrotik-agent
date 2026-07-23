import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listRouters } from '$lib/server/routers';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	return { routers: await listRouters(locals.user.id) };
};
