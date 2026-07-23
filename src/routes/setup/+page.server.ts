import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';
import { countUsers, createUser, createSession } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';

const schema = z.object({
	email: z.string().trim().email().max(255),
	password: z.string().min(8, 'Password minimal 8 karakter').max(1024)
});

// Setup is only available while there are zero users (first-run bootstrap).
export const load: PageServerLoad = async () => {
	if ((await countUsers()) > 0) throw redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if ((await countUsers()) > 0) throw redirect(303, '/login');
		const form = Object.fromEntries(await request.formData());
		const parsed = schema.safeParse(form);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message, email: form.email });
		}
		// First user becomes admin.
		let user;
		try {
			user = await createUser(parsed.data.email, parsed.data.password, 'admin');
		} catch (error) {
			// Concurrent first-run submissions must not leak a database error.
			if ((await countUsers()) > 0) throw redirect(303, '/login');
			console.error('Failed to create initial admin', error);
			return fail(500, { error: 'Admin belum berhasil dibuat. Coba lagi.', email: form.email });
		}
		const session = await createSession(user.id);
		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			expires: session.expiresAt
		});
		throw redirect(303, '/');
	}
};
