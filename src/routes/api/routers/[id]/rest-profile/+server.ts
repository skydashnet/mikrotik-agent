import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRouter } from '$lib/server/routers';
import { runCommand } from '$lib/server/routeros/connection-manager';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id < 1) throw error(400, 'ID router tidak valid.');
	const router = await getRouter(locals.user.id, id);
	if (!router) throw error(404, 'Router tidak ditemukan.');
	if (router.transport !== 'api') {
		return json({ available: false, message: 'Port REST hanya dapat dideteksi melalui koneksi Binary API yang masih aktif.' });
	}

	try {
		const services = await runCommand(locals.user.id, id, { path: '/ip/service', action: 'print' });
		const enabled = (name: string) => services.find((service) => service.name === name && service.disabled !== 'true');
		const service = enabled('www-ssl') ?? enabled('www');
		if (!service?.port) {
			return json({
				available: false,
				message: 'Layanan www dan www-ssl belum aktif pada router ini.'
			});
		}
		const useTls = service.name === 'www-ssl';
		return json({
			available: true,
			port: Number(service.port),
			useTls,
			service: service.name,
			message: `Ditemukan layanan ${service.name} pada port ${service.port}.`
		});
	} catch (cause) {
		return json({
			available: false,
			message: cause instanceof Error ? cause.message : 'Konfigurasi layanan REST gagal dibaca.'
		});
	}
};
