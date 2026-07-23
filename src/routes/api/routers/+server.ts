import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { listRouters, createRouter } from '$lib/server/routers';

const createSchema = z.object({
	name: z.string().min(1).max(100),
	host: z.string().trim().min(1).max(255).refine((v) => !/[\s\/?#@]/.test(v) && !v.includes('://'), 'Host/IP tidak valid'),
	transport: z.enum(['rest', 'api']),
	port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
	useTls: z.boolean().default(false),
	username: z.string().trim().min(1).max(100),
	password: z.string().min(1).max(1024)
});

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401);
	return json(await listRouters(locals.user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401);
	const parsed = createSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);
	const id = await createRouter(locals.user.id, parsed.data);
	return json({ id }, { status: 201 });
};
