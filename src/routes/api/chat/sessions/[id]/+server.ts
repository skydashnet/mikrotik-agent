import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteChatSession } from '$lib/server/chat';
import { removeChatImageFiles } from '$lib/server/chat-images';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const sessionId = Number(params.id);
	if (!Number.isSafeInteger(sessionId) || sessionId < 1) throw error(400, 'Sesi chat tidak valid.');
	const storagePaths = await deleteChatSession(locals.user.id, sessionId);
	if (!storagePaths) throw error(404, 'Sesi chat tidak ditemukan.');
	await removeChatImageFiles(storagePaths);
	return Response.json({ deleted: true });
};
