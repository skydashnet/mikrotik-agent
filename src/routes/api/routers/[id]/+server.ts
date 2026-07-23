import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRouter, deleteRouter, updateRouter } from '$lib/server/routers';
import { dropConnection } from '$lib/server/routeros/connection-manager';
import { z } from 'zod';

const routerSchema = z.object({
	name: z.string().trim().min(1).max(100),
	host: z.string().trim().min(1).max(255).refine((v) => !/[\s\/?#@]/.test(v) && !v.includes('://'), 'Host/IP tidak valid'),
	transport: z.enum(['rest', 'api']),
	port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
	useTls: z.boolean().default(false),
	username: z.string().trim().min(1).max(100),
	password: z.string().max(1024).optional()
});

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) throw error(400, 'ID router tidak valid.');
	const router = await getRouter(locals.user.id, id);
	if (!router) throw error(404);
	return json(router);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) throw error(400, 'ID router tidak valid.');
	const router = await getRouter(locals.user.id, id);
	if (!router) throw error(404, 'Router tidak ditemukan.');
	await dropConnection(id); // close any live socket first
	await deleteRouter(locals.user.id, id);
	return new Response(null, { status: 204 });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id)) throw error(400, 'ID router tidak valid.');
	const parsed = routerSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, parsed.error.issues[0].message);
	const updated = await updateRouter(locals.user.id, id, parsed.data);
	if (!updated) throw error(404, 'Router tidak ditemukan.');
	await dropConnection(id);
	return json({ ok: true });
};
