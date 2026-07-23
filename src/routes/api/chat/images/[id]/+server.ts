import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { getAttachment } from '$lib/server/chat';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const attachmentId = Number(params.id);
	if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) throw error(404);
	const attachment = await getAttachment(locals.user.id, attachmentId);
	if (!attachment) throw error(404, 'Gambar tidak ditemukan.');

	const root = resolve('data', 'chat-uploads');
	const path = resolve(root, attachment.storage_path);
	if (!path.startsWith(`${root}${sep}`)) throw error(400, 'Path gambar tidak valid.');
	let bytes: Buffer;
	try {
		bytes = await readFile(path);
	} catch {
		throw error(404, 'File gambar tidak ditemukan.');
	}
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': attachment.mime_type,
			'Content-Length': String(bytes.length),
			'Cache-Control': 'private, max-age=3600',
			'X-Content-Type-Options': 'nosniff',
			'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
		}
	});
};
